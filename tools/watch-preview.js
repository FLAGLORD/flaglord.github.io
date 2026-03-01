const { program } = require('commander');
const chokidar = require('chokidar');
const { marked } = require('marked');
const fs = require('fs-extra');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');

program
    .argument('<file>', 'Markdown 文件路径')
    .option('-p, --port <number>', '服务端口', '3000')
    .parse(process.argv);

const sourceFile = path.resolve(process.cwd(), program.args[0]);
const port = parseInt(program.opts().port);
const baseName = path.basename(sourceFile, path.extname(sourceFile));

// --- 1. 创建 HTTP Server ---
const server = http.createServer((req, res) => {
    try {
        const markdown = fs.readFileSync(sourceFile, 'utf-8');
        const content = marked.parse(markdown);

        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>实时预览: ${baseName}</title>
    <style>
        body { font-family: sans-serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 20px; background: #fff; }
        pre { background: #f4f4f4; padding: 1rem; border-radius: 5px; overflow: auto; }
        img { max-width: 100%; }
        .nav { color: #888; font-size: 12px; margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
    </style>
</head>
<body>
    <div class="nav">正在实时预览: ${sourceFile}</div>
    <article>${content}</article>
    <script>
        // 自动连接到当前页面的同端口 WebSocket
        const socket = new WebSocket('ws://' + location.host);
        socket.onmessage = (e) => {
            if (e.data === 'reload') {
                console.log('文件已变动，正在刷新...');
                location.reload();
            }
        };
        socket.onclose = () => console.log('预览服务器已关闭');
    </script>
</body>
</html>`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
    } catch (e) {
        res.writeHead(500);
        res.end("Error reading file: " + e.message);
    }
});

// --- 2. 在同一个 Server 上启动 WebSocket ---
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    console.log('📡 浏览器已建立同步连接');
});

// --- 3. 监听文件变动 (WSL 优化) ---
const isWSL = sourceFile.includes('/mnt/');
chokidar.watch(sourceFile, {
    usePolling: isWSL,
    interval: 400
}).on('change', () => {
    console.log(`📝 [${new Date().toLocaleTimeString()}] 文件已更新，正在推送刷新...`);
    wss.clients.forEach(client => {
        if (client.readyState === 1) client.send('reload');
    });
});

// --- 4. 启动服务 ---
server.listen(port, () => {
    console.log('\n' + '='.repeat(40));
    console.log(`🚀 预览服务器已就绪！`);
    console.log(`🔗 请访问: http://localhost:${port}`);
    console.log(`📂 监控路径: ${sourceFile}`);
    console.log(`⚙️  监听模式: ${isWSL ? 'WSL 轮询' : '原生 Inotify'}`);
    console.log('='.repeat(40) + '\n');
});