#!/usr/bin/env node

/**
 * 🛠 WebP 专业转换工具 (webp-conv.js)
 * 特性：智能缩放、sRGB 转换、元数据清理、并发限速、增量更新
 */

const fs = require('fs-extra');
const path = require('path');
const sharp = require('sharp');
const { globby } = require('globby');
const readline = require('readline');
const os = require('os');

const CONFIG = {
    quality: 80,               // 压缩质量
    maxDimension: 1200,        // 针对 Web 优化的最大边长
    effort: 6,                 // CPU 努力程度 (0-6)
    supportedExts: ['.jpg', '.jpeg', '.png', '.bmp', '.tiff'],
    ignorePatterns: [
        '**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/webp/**'
    ]
};

const createReadlineInterface = () => readline.createInterface({ input: process.stdin, output: process.stdout });

async function askConfirmation(question) {
    const rl = createReadlineInterface();
    const answer = await new Promise(resolve => rl.question(question, resolve));
    rl.close();
    return ['y', 'yes'].includes(answer.toLowerCase());
}

/**
 * 专业核心优化引擎
 */
async function optimizeImage(inputPath, deleteOriginal) {
    const ext = path.extname(inputPath).toLowerCase();
    if (!CONFIG.supportedExts.includes(ext)) return { status: 'unsupported' };

    const outputPath = inputPath.replace(new RegExp(`\\${ext}$`, 'i'), '.webp');
    
    // 1. 增量检查：如果输出已存在且更新，则跳过
    if (fs.existsSync(outputPath)) {
        const istat = fs.statSync(inputPath);
        const ostat = fs.statSync(outputPath);
        if (ostat.mtime > istat.mtime) return { status: 'skipped' };
    }

    try {
        const originalSize = fs.statSync(inputPath).size;
        
        // 2. 内存保护机制：限制并发处理时的资源占用
        const pipeline = sharp(inputPath, { failOnError: false, sequentialRead: true });
        const metadata = await pipeline.metadata();

        // 3. 智能缩放判定
        let resizeOptions = {};
        if (metadata.width > CONFIG.maxDimension || metadata.height > CONFIG.maxDimension) {
            if (metadata.width >= metadata.height) {
                resizeOptions = { width: CONFIG.maxDimension, withoutEnlargement: true };
            } else {
                resizeOptions = { height: CONFIG.maxDimension, withoutEnlargement: true };
            }
        }

        // 4. 执行转换序列
        await pipeline
            .rotate()                // 自动修正照片的方向 (基于 EXIF)
            .resize(resizeOptions)
            .toColorspace('srgb')    // 强制 sRGB，防止网页偏色
            .webp({
                quality: CONFIG.quality,
                effort: CONFIG.effort,
                smartSubsample: true, // 提升细节锐度
                alphaQuality: 85      // 透明度质量
            })
            .toFile(outputPath);     // 默认不调用 .keepExif()，即自动剔除元数据

        const newSize = fs.statSync(outputPath).size;
        const ratio = ((1 - newSize / originalSize) * 100).toFixed(1);

        // 5. 删除原图逻辑
        if (deleteOriginal && outputPath !== inputPath) {
            await fs.remove(inputPath);
        }

        return { status: 'success', ratio, outputPath };
    } catch (err) {
        return { status: 'error', message: err.message };
    }
}

/**
 * 批处理控制器
 */
async function processFiles(files, deleteOriginal) {
    console.log(`🚀 正在处理 ${files.length} 个文件...`);
    
    // 根据核心数并行，但至少保留 1 个核心给系统
    const limit = Math.max(1, os.cpus().length - 1);
    const results = { success: 0, skipped: 0, error: 0 };
    
    // 简易并发控制池
    const execute = async (file) => {
        const res = await optimizeImage(file, deleteOriginal);
        if (res.status === 'success') {
            results.success++;
            console.log(`✅ [${res.ratio}%] ${path.basename(file)}`);
        } else if (res.status === 'skipped') {
            results.skipped++;
        } else if (res.status === 'error') {
            results.error++;
            console.error(`❌ 失败 ${path.basename(file)}: ${res.message}`);
        }
    };

    // 分批执行
    for (let i = 0; i < files.length; i += limit) {
        const chunk = files.slice(i, i + limit);
        await Promise.all(chunk.map(execute));
    }
    
    console.log(`\n🏁 统计: 成功 ${results.success}, 跳过 ${results.skipped}, 错误 ${results.error}`);
}

function showHelp() {
    console.log(`
🖼️  WebP 图片转换专家 (webp-conv.js)

用法:
  node webp-conv.js [选项] <文件路径|目录|通配符>

选项:
  -d, --delete    转换成功后删除原始文件 (慎用)
  -h, --help      显示此帮助

示例:
  node webp-conv.js ./photo.jpg
  node webp-conv.js -d ./source/images
  node webp-conv.js "./**/*.png"

优化项:
  - 智能缩放: 最大边长限制为 ${CONFIG.maxDimension}px
  - 转换算法: WebP (Effort ${CONFIG.effort})
  - 色彩空间: 强制转换 sRGB (防止偏色)
  - 隐私保护: 自动剔除 EXIF 元数据
    `);
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
        showHelp();
        return;
    }

    const deleteOriginal = args.includes('-d') || args.includes('--delete');
    const pathArgs = args.filter(arg => !arg.startsWith('-'));

    let allFiles = [];
    for (const p of pathArgs) {
        const resolved = path.resolve(p);
        if (fs.existsSync(resolved)) {
            const stats = fs.statSync(resolved);
            if (stats.isFile()) {
                allFiles.push(resolved);
            } else {
                const found = await globby(path.join(p, '**/*'), { ignore: CONFIG.ignorePatterns, onlyFiles: true });
                allFiles = allFiles.concat(found.map(f => path.resolve(f)));
            }
        } else {
            const found = await globby(p, { ignore: CONFIG.ignorePatterns });
            allFiles = allFiles.concat(found.map(f => path.resolve(f)));
        }
    }

    const targetFiles = allFiles.filter(f => CONFIG.supportedExts.includes(path.extname(f).toLowerCase()));

    if (targetFiles.length === 0) {
        console.error('❌ 未发现可处理的图片文件。');
        return;
    }

    if (deleteOriginal) {
        const confirm = await askConfirmation(`⚠️  警告：将永久删除 ${targetFiles.length} 个原始文件，确定吗？(y/N): `);
        if (!confirm) return console.log('❌ 操作已取消');
    }

    await processFiles(targetFiles, deleteOriginal);
}

main().catch(err => console.error('💥 致命错误:', err));