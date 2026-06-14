/**
 * PM2 ecosystem config — PRODUCTION.
 *
 * Runs the COMPILED artifacts (not dev servers). You must build first:
 *
 *   # backend
 *   cd services/auth && npm ci && npx prisma generate && npx prisma migrate deploy && npm run build
 *   # frontend
 *   cd web && npm ci && npm run build
 *
 * Then from the repo root:
 *   pm2 start ecosystem.config.js
 *   pm2 save                 # persist the process list
 *   pm2 logs                 # tail all logs
 *   pm2 restart all          # after deploying a new build
 *
 * Survive reboot (once, as admin):
 *   pm2 startup    # follow the printed instructions, then: pm2 save
 *
 * NOTE: the backend reads services/auth/.env — it must hold PRODUCTION values
 * (NODE_ENV=production, strong rotated secrets, SMS_PROVIDER=eskiz, real CORS_ORIGINS).
 */

// Windows quirk: Node v17+ won't spawn .cmd/.bat directly without shell:true
// (EINVAL). PM2 doesn't pass that flag, so we go through cmd.exe on Windows and
// sh -c elsewhere.
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
      ...runShell('npm run start:prod'), // node dist/main
      name: 'uzum-auth',
      cwd: './services/auth',
      out_file: './.pm2/uzum-auth.out.log',
      error_file: './.pm2/uzum-auth.err.log',
      env: { NODE_ENV: 'production' },
    },
    {
      ...baseApp,
      ...runShell('npm run start'), // next start (serves the production build)
      name: 'uzum-web',
      cwd: './web',
      out_file: './.pm2/uzum-web.out.log',
      error_file: './.pm2/uzum-web.err.log',
      env: { NODE_ENV: 'production', PORT: '3000' },
    },
  ],
};
