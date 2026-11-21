/* eslint-disable @typescript-eslint/no-require-imports -- pm2 reads this CommonJS file directly */
/**
 * pm2 processes for the laptop server (plan cards S4, S7).
 *   pm2 start scripts/deploy/ecosystem.config.cjs && pm2 save
 * - paytrace: the production build, listening on 127.0.0.1 only, so the
 *   Cloudflare tunnel is the single way in from the internet.
 * - paytrace-deployer: the pull-based deploy loop (deploy.sh watch).
 * - paytrace-tunnel: the named Cloudflare tunnel for paytrace.co.in.
 */
const path = require("node:path");
const os = require("node:os");

const home = process.env.PAYTRACE_DEPLOY_HOME || path.join(os.homedir(), "paytrace-deploy");
const current = path.join(home, "current");

module.exports = {
  apps: [
    {
      name: "paytrace",
      cwd: current,
      script: "node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1 -p 3000",
      env: { NODE_ENV: "production" },
      max_memory_restart: "1500M",
      restart_delay: 3000
    },
    {
      name: "paytrace-deployer",
      script: path.join(__dirname, "deploy.sh"),
      args: "watch",
      interpreter: "bash",
      autorestart: true,
      env: { PAYTRACE_DEPLOY_HOME: home }
    },
    {
      name: "paytrace-tunnel",
      script: "cloudflared",
      args: "tunnel --no-autoupdate run paytrace",
      autorestart: true,
      restart_delay: 5000
    }
  ]
};
