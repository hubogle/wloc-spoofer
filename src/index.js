import { Hono } from "hono/tiny";
import { getPageHtml } from "./page.js";
import { parseCoords, gcj02ToWgs84, round6 } from "./parse.js";

const app = new Hono();

app.get("/", (c) => {
  return c.html(getPageHtml());
});

// 鉴权: Cloudflare 环境变量 WLOC_TOKEN 配置随机字符串; 调用方通过 ?token=... 传入。
// 未配置返回 500, token 不匹配返回 403。
function checkToken(c) {
  const expected = c.env && c.env.WLOC_TOKEN;
  if (!expected) {
    c.header("Access-Control-Allow-Origin", "*");
    return c.json({ error: "WLOC_TOKEN is not configured" }, 500);
  }
  if ((c.req.query("token") || "") !== expected) {
    c.header("Access-Control-Allow-Origin", "*");
    return c.json({ error: "Forbidden" }, 403);
  }
  return null;
}

app.options("/api/parse", (c) => {
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET, OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type");
  return c.body(null, 204);
});

// 地图链接解析: 供快捷指令调用。
// GET /api/parse?u=<链接>&token=<TOKEN>&format=json&cs=<gcj|none>
//   返回 {lat, lon, name}; 高德/苹果地图(中国大陆均为 GCJ-02)自动转 WGS84; 境外坐标自动跳过(out_of_china)。cs=none 可强制不转换。
//   不带 format=json 时返回纯文本 "lat=..&lon=.." 片段。
app.get("/api/parse", async (c) => {
  const denied = checkToken(c);
  if (denied) return denied;

  const raw = c.req.query("u") || "";
  const cs = (c.req.query("cs") || "").toLowerCase();
  const fmt = (c.req.query("format") || "").toLowerCase();
  try {
    let { lat, lon, name, src } = await parseCoords(raw);
    const needConv = cs === "gcj" || (cs !== "none" && (src === "amap" || src === "apple"));
    if (needConv) ({ lat, lon } = gcj02ToWgs84(lat, lon));
    lat = round6(lat);
    lon = round6(lon);
    name = name || "";
    c.header("Access-Control-Allow-Origin", "*");
    if (fmt === "json") return c.json({ lat, lon, name });
    return c.text(`lat=${lat}&lon=${lon}`);
  } catch (e) {
    c.header("Access-Control-Allow-Origin", "*");
    return c.json({ error: String(e && e.message ? e.message : e) }, 422);
  }
});

app.onError((e, c) => {
  console.error(`${e}`);
  return c.text(`${e}`, 500);
});

export default app;
