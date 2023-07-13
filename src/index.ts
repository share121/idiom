import fs from "fs";
import * as cheerio from "cheerio";
import axios, { AxiosResponse } from "axios";
import path from "path";
import { program } from "commander";

program
  .name("Crawling idioms")
  .version("1.0.0")
  .description("Crawling Idiom Data from Baidu Chinese and Other Websites")
  .argument("[path]", "Location for Saving Idiom Data", "idiom.json")
  .option("-t, --threads-num <number>", "Number of threads", "20")
  .action((savePath: string, { threadsNum }: { threadsNum: number }) => {
    savePath = path.join(__dirname, savePath);
    // @ts-ignore
    threadsNum = parseInt(threadsNum);
    const startURLs: {
      url: string;
      match?: ((url: URL) => boolean) | RegExp;
      get($: cheerio.CheerioAPI, url: URL): string[];
    }[] = [
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
          if (url.pathname.startsWith("/cy/")) return [$("h1").text()];
          return [];
        },
      },
    ];
    const configPath = path.join(
      __dirname,
      `${path.basename(__filename, path.extname(__filename))}-config.json`
    );
    try {
      fs.accessSync(savePath, fs.constants.W_OK | fs.constants.R_OK);
    } catch {
      fs.writeFileSync(savePath, "[]", { encoding: "utf-8" });
    }
    let config: {
      visited: string[];
      link: string[];
    } = {
      visited: [],
      link: [],
    };
    try {
      config = JSON.parse(fs.readFileSync(configPath, { encoding: "utf-8" }));
    } catch {}
    let data: string[] = JSON.parse(
      fs.readFileSync(savePath, { encoding: "utf-8" })
    );
    config.link.push(
      ...startURLs
        .map((e) => e.url)
        .filter((e) => !config.link.includes(e) && !config.visited.includes(e))
    );
    let visited = config.visited.map((e) => new URL(e));
    const link = config.link.map((e) => new URL(e));
    const working: {
      url: URL;
      promise: Promise<AxiosResponse<Buffer, any>>;
    }[] = [];
    let errorLink: URL[] = [];
    setTimeout(function fn() {
      while (working.length < threadsNum)
        if (link.length) {
          const url = link.pop()!;
          const t = {
            url,
            promise: axios.get(url.href, {
              responseType: "arraybuffer",
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36 Edg/114.0.1823.41",
              },
            }),
          };
          working.push(t);
          t.promise
            .then((e) => {
              const $ = cheerio.load(e.data, { baseURI: url });
              startURLs
                .filter((e) => {
                  if (e.match instanceof Function) return e.match(url);
                  if (e.match instanceof RegExp) return e.match.test(url.href);
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
                    if (
                      startURLs.some((e) => {
                        if (e.match instanceof Function) return e.match(url);
                        if (e.match instanceof RegExp)
                          return e.match.test(url.href);
                        return url1.hostname === new URL(e.url).hostname;
                      }) &&
                      !working.some((e) => e.url.href === url1.href) &&
                      !link.some((e) => e.href === url1.href) &&
                      !visited.some((e) => e.href === url1.href)
                    )
                      link.push(url1);
                  }
                } catch {}
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
                  if (
                    !working.some((e) => e.url.href === url.href) &&
                    !link.some((e) => e.href === url.href) &&
                    !visited.some((e) => e.href === url.href)
                  )
                    link.push(url);
                }, 60000);
              }
            });
        } else if (!working.length) {
          visited = [];
          link.push(...startURLs.map((e) => new URL(e.url)));
          setTimeout(fn, 60000);
        } else break;
      setTimeout(fn);
    });
    let len = data.length;
    setTimeout(function fn() {
      data = [...new Set(data)];
      console.error(
        "Data length:",
        data.length,
        " | Link to be crawled:",
        link.length,
        " | Link at work:",
        working.length,
        " | Crawled link:",
        visited.length,
        " | Exception link:",
        errorLink.length
      );
      if (data.length !== len) {
        len = data.length;
        fs.writeFileSync(savePath, JSON.stringify(data), {
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
      console.error(
        "Data length:",
        data.length,
        " | Link to be crawled:",
        link.length,
        " | Link at work:",
        working.length,
        " | Crawled link:",
        visited.length,
        " | Exception link:",
        errorLink.length
      );
      fs.writeFileSync(savePath, JSON.stringify(data), {
        encoding: "utf-8",
      });
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          visited,
          link: [...link, ...working.map((e) => e.url), ...errorLink],
        }),
        { encoding: "utf-8" }
      );
      console.error("Successfully exited");
    });
  })
  .parse();
