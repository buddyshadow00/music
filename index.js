
const { Client, GatewayIntentBits, PermissionsBitField, REST, Routes, ChannelType } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, NoSubscriberBehavior } = require('@discordjs/voice');
const ytdl = require('ytdl-core');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const PREFIX = '/';
const playlists = new Map(); // Map to store playlists: Map<adminId, Array<youtubeLink>>
const player = createAudioPlayer({
    behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause,
    },
});
let connection;

async function playMusic(guildId, voiceChannelId, link) {
    if (!connection || connection.state.status === 'disconnected') {
        connection = joinVoiceChannel({
            channelId: voiceChannelId,
            guildId: guildId,
            adapterCreator: client.guilds.cache.get(guildId).voiceAdapterCreator,
        });
    }

    const stream = ytdl(link, { filter: 'audioonly' });
    const resource = createAudioResource(stream);
    player.play(resource);
    connection.subscribe(player);
}

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    const commands = [
        {
            name: 'join',
            description: 'Joins your current voice channel.',
        },
        {
            name: 'add',
            description: 'Adds a YouTube link to your personal playlist.',
            options: [
                {
                    name: 'link',
                    type: 3, // String type
                    description: 'The YouTube link to add.',
                    required: true,
                },
            ],
        },
        {
            name: 'stop',
            description: 'Stops playback and leaves the voice channel.',
        },
        {
            name: 'playlist-create',
            description: 'Creates your personal music playlist.',
        },
        {
            name: 'playlist-delete',
            description: 'Deletes your personal music playlist.',
        }
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    // Check for administrator permission
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: 'You must be an administrator to use this command.', ephemeral: true });
    }

    const { commandName } = interaction;
    const adminId = interaction.user.id;

    if (commandName === 'join') {
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return interaction.reply('You need to be in a voice channel to use this command!');
        }
        if (voiceChannel.type !== ChannelType.GuildVoice) {
            return interaction.reply('You can only join guild voice channels.');
        }

        try {
            connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: interaction.guild.id,
                adapterCreator: interaction.guild.voiceAdapterCreator,
            });
            await interaction.reply('Successfully joined the voice channel!');
        } catch (error) {
            console.error(error);
            await interaction.reply('Could not join the voice channel.');
        }
    } else if (commandName === 'add') {
        const link = interaction.options.getString('link');
        if (!ytdl.validateURL(link)) {
            return interaction.reply({ content: 'Please provide a valid YouTube link.', ephemeral: true });
        }

        if (!playlists.has(adminId)) {
            playlists.set(adminId, []);
        }
        playlists.get(adminId).push(link);
        await interaction.reply('Added to your playlist!');

    } else if (commandName === 'stop') {
        if (connection) {
            player.stop();
            connection.destroy();
            connection = null;
            await interaction.reply('Stopped playing and left the voice channel.');
        } else {
            await interaction.reply('I am not currently in a voice channel.');
        }
    } else if (commandName === 'playlist-create') {
        if (playlists.has(adminId)) {
            return interaction.reply({ content: 'You already have a playlist!', ephemeral: true });
        }
        playlists.set(adminId, []);
        await interaction.reply('Your personal playlist has been created!');
    } else if (commandName === 'playlist-delete') {
        if (!playlists.has(adminId)) {
            return interaction.reply({ content: 'You do not have a playlist to delete.', ephemeral: true });
        }
        playlists.delete(adminId);
        await interaction.reply('Your personal playlist has been deleted.');
    }
});

client.login(process.env.DISCORD_TOKEN);
