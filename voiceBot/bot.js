// bot.js

// ===================== IMPORTS =====================
const fs = require("fs");
const path = require("path");
const {
  Client,
  GatewayIntentBits,
  Partials,
} = require("discord.js");
const {
  joinVoiceChannel,
  getVoiceConnection,
  createAudioPlayer,
  createAudioResource,
  EndBehaviorType,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
} = require("@discordjs/voice");
const prism = require("prism-media");

// Node 18+ has global fetch; if not, you could require("node-fetch")
const fetch = global.fetch;

// ===================== CONFIG ======================

// TODO: put your real bot token here
const DISCORD_TOKEN = "discord token here";

// Python backend (processor_server.py)
const PYTHON_SERVER_URL = "http://127.0.0.1:8000/process";

// how long to consider “one utterance”? (ms of silence)
const SILENCE_MS = 1000;

// audio player to play Piper WAV replies
const audioPlayer = createAudioPlayer();

// ===================== DISCORD CLIENT ==============
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ===================== HELPERS =====================

async function sendAudioToPython(pcmBuffer) {
  const res = await fetch(PYTHON_SERVER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
    },
    body: pcmBuffer,
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Python server error: ${res.status} ${txt}`);
  }

  return res.json(); // { user_text, reply_text, reply_audio_b64 }
}

async function playReplyWav(guildId, replyAudioB64) {
  const wavPath = path.join(__dirname, `reply_${guildId}.wav`);
  const wavBuffer = Buffer.from(replyAudioB64, "base64");
  fs.writeFileSync(wavPath, wavBuffer);

  const resource = createAudioResource(fs.createReadStream(wavPath));
  audioPlayer.play(resource);

  return new Promise((resolve) => {
    audioPlayer.once(AudioPlayerStatus.Idle, () => {
      try {
        fs.unlinkSync(wavPath);
      } catch (_) {}
      resolve();
    });

    audioPlayer.once("error", (err) => {
      console.error("AudioPlayer error:", err);
      resolve();
    });
  });
}

// ===================== COMMAND HANDLER =============

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim();

  if (content === "!join") {
    if (!message.member.voice.channel) {
      return message.reply("You need to be in a voice channel first.");
    }

    const channel = message.member.voice.channel;

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false, // must NOT deafen to receive audio
    });

    connection.subscribe(audioPlayer);

    // optional: wait until ready
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
      console.log("Voice connection is ready.");
    } catch (err) {
      console.error("Failed to become ready:", err);
      return message.reply("Failed to connect to voice channel.");
    }

    return message.reply(`Joined ${channel.name}`);
  }

  if (content === "!leave") {
    const connection = getVoiceConnection(message.guild.id);
    if (connection) {
      connection.destroy();
      return message.reply("Disconnected from voice.");
    } else {
      return message.reply("I'm not in a voice channel.");
    }
  }

  if (content === "!listen") {
    const connection = getVoiceConnection(message.guild.id);
    if (!connection) {
      return message.reply("Use !join first so I can enter your voice channel.");
    }

    // Listen only to the user who ran the command
    startListeningToUser(message, connection, message.author.id);
  }
});

// ===================== LISTENING LOGIC =============

function startListeningToUser(message, connection, userId) {
  const guildId = message.guild.id;
  const receiver = connection.receiver;

  message.reply("🎧 Listening to you. Start talking!");

  receiver.speaking.on("start", (targetId) => {
    if (targetId !== userId) return; // only listen to the command author
    console.log(`User ${targetId} started speaking`);

    // Subscribe to Opus audio packets for this user
    const opusStream = receiver.subscribe(targetId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: SILENCE_MS,
      },
    });

    // Safety: catch Opus stream errors so they don't crash the bot
    opusStream.on("error", (err) => {
      console.warn("Opus stream error (ignored):", err.message);
    });

    // Decode Opus → PCM s16le 48kHz stereo
    const decoder = new prism.opus.Decoder({
      rate: 48000,
      channels: 2,
      frameSize: 960,
    });

    const pcmStream = opusStream.pipe(decoder);
    const chunks = [];

    decoder.on("data", (chunk) => {
      chunks.push(chunk);
    });

    decoder.on("error", (err) => {
      // This is where "The compressed data passed is corrupted" comes from.
      // We catch and log it so the bot doesn't crash.
      console.warn("Decoder error (ignored):", err.message);
    });

    pcmStream.on("end", async () => {
      console.log("User stopped speaking, processing chunk…");

      const pcmBuffer = Buffer.concat(chunks);

      if (pcmBuffer.length < 1000) {
        console.log("Chunk too small, skipping.");
        return;
      }

      try {
        const { user_text, reply_text, reply_audio_b64 } =
          await sendAudioToPython(pcmBuffer);

        console.log("User text:", user_text);
        console.log("Bot reply:", reply_text);

        await message.channel.send(
          `**You said:** ${user_text}\n**Bot:** ${reply_text}`
        );

        await playReplyWav(guildId, reply_audio_b64);
      } catch (err) {
        console.error("Error talking to Python server:", err);
        message.channel.send(
          `Error from AI backend: \`${err.message}\``
        );
      }
    });
  });
}

// ===================== LOGIN =======================

client.login(DISCORD_TOKEN);
