import { copyFile, writeFile } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { fileURLToPath } from 'node:url';
import { defineConfig, normalizePath, type Plugin } from 'vite';
import { SAVE_ENDPOINT, findConfigIssues } from './src/config/scene.config.ts';

const CONFIG_PATH = fileURLToPath(new URL('./src/config/scene.config.json', import.meta.url));
const BACKUP_PATH = fileURLToPath(new URL('./src/config/scene.config.backup.json', import.meta.url));
const MAX_BODY_BYTES = 1_000_000;
const HTTP_NO_CONTENT = 204;
const HTTP_BAD_REQUEST = 400;
const HTTP_METHOD_NOT_ALLOWED = 405;
const HTTP_SERVER_ERROR = 500;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) reject(new Error(`內容超過 ${MAX_BODY_BYTES} 字元`));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// Inspector 的「儲存」：把畫面上的數值寫回 scene.config.json，寫之前先備份成 scene.config.backup.json。
// apply: 'serve' 讓它只在 vite dev 存在，build 不會帶進去。
function sceneConfigSave(): Plugin {
  const configFile = normalizePath(CONFIG_PATH);
  return {
    name: 'scene-config-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(SAVE_ENDPOINT, (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = HTTP_METHOD_NOT_ALLOWED;
          res.end('只接受 POST');
          return;
        }
        readBody(req)
          .then(async (body) => {
            const issues = findConfigIssues(JSON.parse(body));
            if (issues.length > 0) {
              res.statusCode = HTTP_BAD_REQUEST;
              res.end(`格式不對：${issues.join('、')}`);
              return;
            }
            await copyFile(CONFIG_PATH, BACKUP_PATH);
            await writeFile(CONFIG_PATH, body.endsWith('\n') ? body : `${body}\n`, 'utf8');
            server.config.logger.info(`已儲存 scene.config.json（舊檔備份為 scene.config.backup.json）`, { timestamp: true });
            res.statusCode = HTTP_NO_CONTENT;
            res.end();
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            server.config.logger.error(`儲存 scene.config.json 失敗：${message}`, { timestamp: true });
            res.statusCode = error instanceof SyntaxError ? HTTP_BAD_REQUEST : HTTP_SERVER_ERROR;
            res.end(message);
          });
      });
    },
    // 存檔不觸發熱更新：頁面上已經是這些值，重新載入只會把玩家位置、鏡頭狀態洗掉。
    handleHotUpdate({ file }) {
      if (normalizePath(file) === configFile) return [];
    },
  };
}

// 相對路徑：打包後的 dist/ 放在任何子資料夾都能直接開。
export default defineConfig({
  base: './',
  plugins: [sceneConfigSave()],
});
