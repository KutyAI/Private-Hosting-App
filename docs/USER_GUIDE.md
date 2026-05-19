# MC Hosting Platform - User Guide

## Quick Start

### 1. Install and Launch
- Download the installer from our website
- Run the installer (UAC prompt will appear for service installation)
- Launch the app from your Start menu

### 2. Create Your Account
- On first launch, click "Create Account"
- Enter your email and choose a password
- Click "Get Started"

### 3. Create Your First Server
- Click the **"+ New Server"** button on the Dashboard
- Choose a name (e.g., "My Survival Server")
- Select server type: **Vanilla** or **Paper**
- Choose Minecraft version (e.g., 1.20.4)
- Set RAM allocation (1024MB min, 2048MB max recommended)
- Click **"Create"**

### 4. Start the Server
- Click the **▶ Play** button next to your server
- Wait for the status to change to **"running"**
- Your server is now online!

### 5. Invite Friends
- Go to the **Access** tab
- Click **"Generate Invite Code"**
- Share the code with your friend
- They enter the code in their app and connect!

---

## Dashboard

The Dashboard shows:
- **Server status** - stopped, starting, running, crashed
- **Active players** - current player count
- **Memory usage** - RAM consumed by the server
- **Uptime** - how long the server has been running
- **TPS** - server ticks per second (20 is optimal)

### Server Controls
- **▶ Start** - Launch the server
- **■ Stop** - Gracefully shut down
- **↻ Restart** - Stop and start
- **🗑 Delete** - Remove the server permanently

---

## Console

The Console tab shows live server logs:
- **White text** - Normal server messages
- **Yellow text** - Warnings
- **Red text** - Errors
- **Gray text** - Debug information

### Sending Commands
Type any Minecraft command in the input box and press Enter:
- `/op playername` - Grant operator status
- `/gamemode creative playername` - Change game mode
- `/whitelist add playername` - Add to whitelist
- `/save-all` - Force world save

---

## Settings

Edit your server configuration:
- **MOTD** - Message of the Day (shown in server list)
- **Port** - Local port (default: 25565)
- **Max Players** - Maximum concurrent players
- **Gamemode** - survival, creative, adventure, spectator
- **Difficulty** - peaceful, easy, normal, hard
- **Toggles** - PvP, whitelist, flight, monsters, animals, etc.

Click **"Save Settings"** to apply changes.

---

## Backups

### Manual Backup
1. Select your server on the Dashboard
2. Go to the **Backups** tab
3. Click **"Create Backup"**

### Scheduled Backups
1. Click the **"Schedule"** button
2. Set the interval (e.g., every 6 hours)
3. Set maximum backups to keep (e.g., 10)
4. Enable the schedule
5. Click **"Save Schedule"**

### Restore a Backup
1. Find the backup in the list
2. Click the **↻ Restore** button
3. Confirm the restore
4. The server will restart with the restored world

---

## Access Control

### Invite Codes
- Generate codes that friends use to join
- Codes expire after 24 hours by default
- Each code can be used up to 10 times

### Friend System
- Add friends by their email address
- Friends appear in your friend list
- Easily invite friends without codes

---

## Diagnostics

The Diagnostics tab helps troubleshoot issues:
- **Network Status** - NAT type, public/local addresses
- **System Info** - Platform, memory usage, uptime
- **Connectivity Tests** - Test connections to external services
- **Server Diagnostics** - Server-specific health checks

---

## Troubleshooting

### Server won't start
1. Check the Console for error messages
2. Verify Java is installed (Java 17+)
3. Check RAM allocation isn't too high
4. Try restarting the agent

### Friends can't connect
1. Verify your server is running
2. Check the invite code hasn't expired
3. Ensure your agent is connected (green indicator)
4. Try generating a new invite code

### High memory usage
1. Reduce max RAM in server settings
2. Check for memory leaks in mods/plugins
3. Restart the server periodically

### Backup fails
1. Ensure you have enough disk space
2. Close any programs accessing the world folder
3. Try a smaller backup (exclude logs/cache)

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send console command |
| `Ctrl+L` | Clear console |
| `Ctrl+R` | Refresh dashboard |

---

## Support

- **Documentation**: https://docs.mchosting.local
- **Discord**: https://discord.gg/mchosting
- **Email**: support@mchosting.local
- **GitHub Issues**: https://github.com/mchosting/issues
