"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const cheerio = __importStar(require("cheerio"));
const axios_1 = __importDefault(require("axios"));
const path_1 = __importDefault(require("path"));
const commander_1 = require("commander");
commander_1.program
    .name("Crawling idioms")
    .version("1.0.0")
    .description("Crawling Idiom Data from Baidu Chinese and Other Websites")
    .argument("[path]", "Location for Saving Idiom Data", "idiom.json")
    .option("-t, --threads-num <number>", "Number of threads", "20")
    .action((savePath, { threadsNum }) => {
    savePath = path_1.default.join(__dirname, savePath);
    // @ts-ignore
    threadsNum = parseInt(threadsNum);
    const startURLs = [
        {
            url: "https://hanyu.baidu.com/s?wd=%E4%BA%95%E4%BA%95%E6%9C%89%E6%9D%A1&device=pc&from=home",
            get($) {
                if ($("#idiom-body").length)
                    return [$("#term-header h2 strong").text()];
                return [];
            },
        },
        {
            url: "https://chengyu.qianp.com/",
            get($, url) {
                if (url.pathname.startsWith("/cy/"))
                    return [$("h1").text()];
                return [];
            },
        },
    ];
    const configPath = path_1.default.join(__dirname, `${path_1.default.basename(__filename, path_1.default.extname(__filename))}-config.json`);
    try {
        fs_1.default.accessSync(savePath, fs_1.default.constants.W_OK | fs_1.default.constants.R_OK);
    }
    catch {
        fs_1.default.writeFileSync(savePath, "[]", { encoding: "utf-8" });
    }
    let config = {
        visited: [],
        link: [],
    };
    try {
        config = JSON.parse(fs_1.default.readFileSync(configPath, { encoding: "utf-8" }));
    }
    catch { }
    let data = JSON.parse(fs_1.default.readFileSync(savePath, { encoding: "utf-8" }));
    config.link.push(...startURLs
        .map((e) => e.url)
        .filter((e) => !config.link.includes(e) && !config.visited.includes(e)));
    let visited = config.visited.map((e) => new URL(e));
    const link = config.link.map((e) => new URL(e));
    const working = [];
    let errorLink = [];
    setTimeout(function fn() {
        while (working.length < threadsNum)
            if (link.length) {
                const url = link.pop();
                const t = {
                    url,
                    promise: axios_1.default.get(url.href, {
                        responseType: "arraybuffer",
                        headers: {
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36 Edg/114.0.1823.41",
                        },
                    }),
                };
                working.push(t);
                t.promise
                    .then((e) => {
                    const $ = cheerio.load(e.data, { baseURI: url });
                    startURLs
                        .filter((e) => {
                        if (e.match instanceof Function)
                            return e.match(url);
                        if (e.match instanceof RegExp)
                            return e.match.test(url.href);
                        return url.hostname === new URL(e.url).hostname;
                    })
                        .forEach((e) => {
                        const t = e.get($, url);
                        data.push(...t);
                    });
                    $("a[href]").each((_, el) => {
                        try {
                            const t1 = $(el).prop("href");
                            if (t1) {
                                const url1 = new URL(t1, url);
                                if (startURLs.some((e) => {
                                    if (e.match instanceof Function)
                                        return e.match(url);
                                    if (e.match instanceof RegExp)
                                        return e.match.test(url.href);
                                    return url1.hostname === new URL(e.url).hostname;
                                }) &&
                                    !working.some((e) => e.url.href === url1.href) &&
                                    !link.some((e) => e.href === url1.href) &&
                                    !visited.some((e) => e.href === url1.href))
                                    link.push(url1);
                            }
                        }
                        catch { }
                    });
                    const i = working.findIndex((e) => e.url.href === url.href);
                    if (i !== -1) {
                        visited.push(url);
                        working.splice(i, 1);
                    }
                    errorLink = errorLink.filter((e) => e.href !== url.href);
                })
                    .catch((e) => {
                    console.error("Access error:", url.href, e.message);
                    const i = working.findIndex((e) => e.url.href === url.href);
                    if (i !== -1) {
                        if (!errorLink.some((e) => e.href === url.href))
                            errorLink.push(url);
                        working.splice(i, 1);
                        setTimeout(() => {
                            if (!working.some((e) => e.url.href === url.href) &&
                                !link.some((e) => e.href === url.href) &&
                                !visited.some((e) => e.href === url.href))
                                link.push(url);
                        }, 60000);
                    }
                });
            }
            else if (!working.length) {
                visited = [];
                link.push(...startURLs.map((e) => new URL(e.url)));
                setTimeout(fn, 60000);
            }
            else
                break;
        setTimeout(fn);
    });
    let len = data.length;
    setTimeout(function fn() {
        data = [...new Set(data)];
        console.error("Data length:", data.length, " | Link to be crawled:", link.length, " | Link at work:", working.length, " | Crawled link:", visited.length, " | Exception link:", errorLink.length);
        if (data.length !== len) {
            len = data.length;
            fs_1.default.writeFileSync(savePath, JSON.stringify(data), {
                encoding: "utf-8",
            });
        }
        setTimeout(fn, 10000);
    }, 10000);
    process.on("uncaughtException", (...a) => {
        console.error("uncaughtException", a);
        process.exit();
    });
    process.on("SIGINT", () => process.exit());
    process.on("SIGHUP", () => process.exit());
    process.on("exit", () => {
        data = [...new Set(data)];
        console.error("Data length:", data.length, " | Link to be crawled:", link.length, " | Link at work:", working.length, " | Crawled link:", visited.length, " | Exception link:", errorLink.length);
        fs_1.default.writeFileSync(savePath, JSON.stringify(data), {
            encoding: "utf-8",
        });
        fs_1.default.writeFileSync(configPath, JSON.stringify({
            visited,
            link: [...link, ...working.map((e) => e.url), ...errorLink],
        }), { encoding: "utf-8" });
        console.error("Successfully exited");
    });
})
    .parse();
