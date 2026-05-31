/**
 * PM2 ecosystem config — keeps the auth backend + web frontend running permanently.
 *
 * Why this exists:
 *   Running `npm run start:dev` in a terminal is fragile — when you close VS Code,
 *   the dev terminal, or restart your machine, the service dies and login breaks
 *   with "SMS yuborishda xato". PM2 daemonizes the processes so they survive
 *   terminal closes, auto-restart on crash, and (optionally) survive reboots.
 *
 * One-time setup:
 *   npm install -g pm2     (already done)
 *
 * Daily usage (just one command):
 *   pm2 start ecosystem.config.js     # or double-click start.bat
 *   pm2 list                          # see what's running
 *   pm2 logs                          # tail all logs
 *   pm2 logs uzum-auth                # tail just backend
 *   pm2 restart all                   # force restart everything
 *   pm2 stop all                      # stop everything
 *
 * Survive reboot (optional, requires admin once):
 *   pm2 save
 *   npm install -g pm2-windows-startup
 *   pm2-startup install
 */

// Windows quirk: Node.js v17+ refuses to spawn .cmd / .bat files directly without
// `shell: true` (EINVAL). PM2 doesn't pass that flag, so we go through cmd.exe.
// On Linux/macOS we use `sh -c` for symmetry.
const isWin = process.platform === 'win32';

function runShell(cmd) {
  return isWin
    ? { script: 'cmd.exe', args: ['/c', cmd] }
    : { script: 'sh', args: ['-c', cmd] };
}

const baseApp = {
  interpreter: 'none', // critical: don't try to parse the script as Node.js
  watch: false,
  autorestart: true,
  // Don't restart faster than every 10s — protects from boot loops on bad config.
  min_uptime: '10s',
  max_restarts: 10,
  restart_delay: 3000,
  merge_logs: true,
  time: true,
};

module.exports = {
  apps: [
    {
      ...baseApp,
      ...runShell('npm run start:dev'),
      name: 'uzum-auth',
      cwd: './services/auth',
      out_file: './.pm2/uzum-auth.out.log',
      error_file: './.pm2/uzum-auth.err.log',
      env: { NODE_ENV: 'development' },
    },
    {
      ...baseApp,
      ...runShell('npm run dev'),
      name: 'uzum-web',
      cwd: './web',
      out_file: './.pm2/uzum-web.out.log',
      error_file: './.pm2/uzum-web.err.log',
      env: { NODE_ENV: 'development' },
    },
  ],
};
