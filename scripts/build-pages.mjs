import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const clientDir = path.join(root, 'dist', 'client');
const workerEntry = path.join(root, 'dist', 'barbearia_saas_platform', 'index.js');
const deployDir = path.join(root, 'dist', 'pages-deploy');
const publicDir = path.join(deployDir, 'public');

if (!fs.existsSync(clientDir) || !fs.existsSync(workerEntry)) {
  throw new Error('Execute "npm run build" antes de gerar o pacote do Cloudflare Pages.');
}

fs.rmSync(deployDir, { recursive: true, force: true });
fs.mkdirSync(publicDir, { recursive: true });
fs.cpSync(clientDir, publicDir, { recursive: true });

// Copy compiled Worker bundle as Pages Advanced Mode _worker.js
fs.copyFileSync(workerEntry, path.join(publicDir, '_worker.js'));

// Remove .assetsignore if present (not needed in Pages public dir)
const assetsIgnore = path.join(publicDir, '.assetsignore');
if (fs.existsSync(assetsIgnore)) {
  fs.rmSync(assetsIgnore);
}

// Route only dynamic endpoints through _worker.js so static assets stay at 0 Worker invocations
const routesJson = {
  version: 1,
  include: ['/api/*', '/media/*', '/b/*', '/sitemap.xml', '/robots.txt'],
  exclude: []
};
fs.writeFileSync(path.join(publicDir, '_routes.json'), JSON.stringify(routesJson, null, 2));

// Pages-compatible wrangler.jsonc (outside public/ so it is never uploaded as a static asset)
const pagesWrangler = {
  $schema: '../../node_modules/wrangler/config-schema.json',
  name: 'barbeariachatbot',
  pages_build_output_dir: './public',
  compatibility_date: '2025-05-01',
  compatibility_flags: ['nodejs_compat'],
  d1_databases: [
    {
      binding: 'DB',
      database_name: 'barbearia-saas-db',
      database_id: '23368ad4-c601-44ff-8471-58b0c7557909'
    }
  ],
  vars: {
    ENVIRONMENT: 'production',
    APP_NAME: 'BarberSaaS',
    TURNSTILE_SITE_KEY: '1x00000000000000000000AA'
  }
};
fs.writeFileSync(
  path.join(deployDir, 'wrangler.jsonc'),
  JSON.stringify(pagesWrangler, null, 2)
);

console.log('Cloudflare Pages bundle preparado em dist/pages-deploy/');
