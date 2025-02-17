// In the renderer process.
const { ipcRenderer, clipboard, nativeImage } = require("electron");
const Store = require("electron-store");
const hotkeys = require("hotkeys-js");

// 获取设置
var store = new Store();

if (store.get("框选.自动框选.开启")) {
    var cv = require("opencv.js");
}

var 工具栏跟随, 光标, 四角坐标, 遮罩颜色, 选区颜色, 取色器默认格式, 取色器格式位置, color_size, color_i_size;
var all_color_format = ["HEX", "RGB", "HSL", "HSV", "CMYK"];
function set_setting() {
    工具栏跟随 = store.get("工具栏跟随");
    光标 = store.get("光标");
    四角坐标 = store.get("显示四角坐标");
    取色器默认格式 = store.get("取色器默认格式");
    for (let i in all_color_format) {
        if (取色器默认格式 == all_color_format[i]) {
            取色器格式位置 = Number(i) + 1;
            break;
        }
    }
    遮罩颜色 = store.get("遮罩颜色");
    选区颜色 = store.get("选区颜色");

    var 字体 = store.get("字体");
    document.documentElement.style.setProperty("--main-font", 字体.主要字体);
    document.documentElement.style.setProperty("--monospace", 字体.等宽字体);

    document.documentElement.style.setProperty("--icon-color", store.get("全局.图标颜色")[1]);

    var 模糊 = store.get("全局.模糊");
    if (模糊 != 0) {
        document.documentElement.style.setProperty("--blur", `blur(${模糊}px)`);
    } else {
        document.documentElement.style.setProperty("--blur", `none`);
    }

    document.documentElement.style.setProperty("--alpha", store.get("全局.不透明度"));

    color_size = store.get("取色器大小");
    color_i_size = store.get("像素大小");
    document.documentElement.style.setProperty("--color-size", `${color_size * color_i_size}px`);
    document.documentElement.style.setProperty("--color-i-size", `${color_i_size}px`);
    document.documentElement.style.setProperty("--color-i-i", `${color_size}`);
    let 工具栏 = store.get("工具栏");
    document.documentElement.style.setProperty("--bar-size", `${工具栏.按钮大小}px`);
    document.documentElement.style.setProperty("--bar-icon", `${工具栏.按钮图标比例}`);
}

var 全局缩放 = store.get("全局.缩放") || 1.0;
var ratio = window.devicePixelRatio;
const main_canvas = <HTMLCanvasElement>document.getElementById("main_photo");
main_canvas.style.width = window.screen.width / 全局缩放 + "px";
const clip_canvas = <HTMLCanvasElement>document.getElementById("clip_photo");
clip_canvas.style.width = window.screen.width / 全局缩放 + "px";
const draw_canvas = <HTMLCanvasElement>document.getElementById("draw_photo");
draw_canvas.style.width = window.screen.width / 全局缩放 + "px";
// 第一次截的一定是桌面,所以可提前定义
main_canvas.width = clip_canvas.width = draw_canvas.width = window.screen.width * window.devicePixelRatio;
main_canvas.height = clip_canvas.height = draw_canvas.height = window.screen.height * window.devicePixelRatio;

var final_rect = [0, 0, main_canvas.width, main_canvas.height];

set_setting();
ipcRenderer.on("reflash", (a, data, ww, hh, act) => {
    console.log(data);
    function to_canvas(canvas: HTMLCanvasElement, img: Buffer, w: number, h: number) {
        canvas.width = w;
        canvas.height = h;
        let x = nativeImage.createFromBuffer(img).toBitmap();
        for (let i = 0; i < x.length; i += 4) {
            [x[i], x[i + 2]] = [x[i + 2], x[i]];
        }
        let d = new ImageData(Uint8ClampedArray.from(x), w, h);
        canvas.getContext("2d").putImageData(d, 0, 0);
    }
    for (let i of data) {
        if (i) {
            if (i.isPrimary) {
                main_canvas.width = clip_canvas.width = draw_canvas.width = i.width;
                main_canvas.height = clip_canvas.height = draw_canvas.height = i.height;
                to_canvas(main_canvas, i.image, i.width, i.height);
                final_rect = [0, 0, main_canvas.width, main_canvas.height];
            }
            let c = document.createElement("canvas");
            to_canvas(c, i.image, i.width, i.height);
            let div = document.createElement("div");
            div.append(c);
            side_bar_screens.append(div);
            div.onclick = () => {
                to_canvas(main_canvas, i.image, i.width, i.height);
                final_rect = [0, 0, main_canvas.width, main_canvas.height];
            };
        }
    }

    switch (act) {
        case "ocr":
            tool_ocr_f();
            break;
        case "image_search":
            tool_search_f();
            break;
    }

    if (store.get("框选.自动框选.开启")) {
        setTimeout(() => {
            edge();
        }, 0);
    }
});

var edge_init = false;
var edge_rect = [];
function edge() {
    edge_init = true;
    let canvas = main_canvas;
    let src = cv.imread(canvas);

    cv.cvtColor(src, src, cv.COLOR_RGBA2RGB);
    // cv.imshow(canvas, src);

    let dst = new cv.Mat();
    let c_min = store.get("框选.自动框选.最小阈值"),
        c_max = store.get("框选.自动框选.最大阈值");
    cv.Canny(src, dst, c_min, c_max, 3, true);

    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();

    cv.findContours(dst, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);

    for (let i = 0; i < contours.size(); i++) {
        let cnt = contours.get(i);
        edge_rect.push(cv.boundingRect(cnt));
    }

    // cv.imshow(canvas, dst);

    src.delete();
    dst.delete();
    contours.delete();
    hierarchy.delete();

    src = dst = contours = hierarchy = null;
}

// 左边窗口工具栏弹出
var o = false;
const side_bar = document.getElementById("windows_bar");
const side_bar_screens = document.getElementById("screens");
hotkeys("z", windows_bar_c_o);
function windows_bar_c_o() {
    if (!o) {
        document.getElementById("windows_bar").style.transform = "translateX(0)";
        o = true;
    } else {
        document.getElementById("windows_bar").style.transform = "translateX(-100%)";
        o = false;
    }
}

document.getElementById("windows_bar_close").onclick = windows_bar_c_o;

var b_scope = null;
var center_bar_show = false;
var center_bar_m = null;
function s_center_bar(m) {
    hotkeys.deleteScope("c_bar");
    if (center_bar_m == m) {
        center_bar_show = false;
        center_bar_m = null;
    } else {
        center_bar_show = true;
        center_bar_m = m;
    }
    if (m === false) center_bar_show = false;
    if (center_bar_show) {
        document.getElementById("save_type").style.height = "0";
        document.getElementById("draw_edit").style.height = "0";
        document.getElementById("save_type").style.width = "0";
        document.getElementById("draw_edit").style.width = "0";
        document.getElementById("center_bar").style.opacity = "1";
        document.getElementById("center_bar").style.pointerEvents = "auto";
        if (hotkeys.getScope() != "all") b_scope = hotkeys.getScope();
        hotkeys.setScope("c_bar");
    } else {
        document.getElementById("center_bar").style.opacity = "0";
        document.getElementById("center_bar").style.pointerEvents = "none";
        hotkeys.setScope(b_scope || "normal");
    }
    switch (m) {
        case "save":
            document.getElementById("save_type").style.height = "";
            document.getElementById("save_type").style.width = "";
            break;
        case "edit":
            document.getElementById("draw_edit").style.height = "";
            document.getElementById("draw_edit").style.width = "";
            break;
    }
}

var tool_bar = document.getElementById("tool_bar");
// 工具栏按钮
tool_bar.onmouseup = (e) => {
    var el = <HTMLElement>e.target;
    if (el.parentElement != tool_bar) return;
    if (e.button == 0) {
        // * 拼接函数名
        eval(`${el.id}_f()`);
    }
    // 中键取消抬起操作
    if (e.button == 1) {
        el.style.backgroundColor = "";
        auto_do = "no";
    }
};

hotkeys.filter = (event) => {
    var tagName = (event.target || event.srcElement).tagName;
    var v =
        !(event.target.isContentEditable || tagName == "INPUT" || tagName == "SELECT" || tagName == "TEXTAREA") ||
        event.target === document.querySelector("#draw_edit input");
    return v;
};

hotkeys.setScope("normal");
hotkeys(store.get("其他快捷键.关闭"), "normal", tool_close_f);
hotkeys(store.get("其他快捷键.OCR"), "normal", tool_ocr_f);
hotkeys(store.get("其他快捷键.以图搜图"), "normal", tool_search_f);
hotkeys(store.get("其他快捷键.QR码"), "normal", tool_QR_f);
hotkeys(store.get("其他快捷键.图像编辑"), "normal", tool_draw_f);
hotkeys(store.get("其他快捷键.其他应用打开"), "normal", tool_open_f);
hotkeys(store.get("其他快捷键.放在屏幕上"), "normal", tool_ding_f);
hotkeys(store.get("其他快捷键.复制"), "normal", tool_copy_f);
hotkeys(store.get("其他快捷键.保存"), "normal", tool_save_f);

var auto_do = store.get("框选后默认操作");
if (auto_do != "no") {
    document.getElementById(`tool_${auto_do}`).style.backgroundColor = "var(--hover-color)";
}

// 关闭
function tool_close_f() {
    document.querySelector("html").style.display = "none"; /* 退出时隐藏，透明窗口，动画不明显 */
    setTimeout(() => {
        ipcRenderer.send("clip_main_b", "window-close");
        location.reload();
    }, 50);
}
// OCR
var ocr引擎 = <HTMLSelectElement>document.getElementById("ocr引擎");
for (let i of store.get("离线OCR")) {
    let o = document.createElement("option");
    o.innerText = `${i[0]}`;
    o.value = `${i[0]}`;
    ocr引擎.append(o);
}
ocr引擎.insertAdjacentHTML("beforeend", `<option value="baidu">百度</option><option value="youdao">有道</option>`);
ocr引擎.value = store.get("OCR.记住") || store.get("OCR.类型");
document.getElementById("ocr引擎").oninput = () => {
    if (store.get("OCR.记住")) store.set("OCR.记住", ocr引擎.value);
    tool_ocr_f();
};
document.getElementById("tool_ocr").title = `OCR(文字识别) - ${ocr引擎.value}`;

function tool_ocr_f() {
    var type = ocr引擎.value;
    get_clip_photo("png").then((c: HTMLCanvasElement) => {
        ipcRenderer.send("clip_main_b", "ocr", [c.toDataURL().replace(/^data:image\/\w+;base64,/, ""), type]);
    });

    scan_line();

    ipcRenderer.on("ocr_back", (event, arg) => {
        if (arg == "ok") {
            document.getElementById("waiting").style.display = "none";
            tool_close_f();
        } else {
            document.getElementById("waiting").style.display = "none";
        }
    });
}
function scan_line() {
    document.getElementById("waiting").style.display = "block";
    document.getElementById("waiting").style.left = final_rect[0] / ratio + "px";
    document.getElementById("waiting").style.top = final_rect[1] / ratio + "px";
    document.getElementById("waiting").style.width = final_rect[2] / ratio + "px";
    document.getElementById("waiting").style.height = final_rect[3] / ratio + "px";
    (<SVGAnimateElement>document.querySelectorAll("#waiting line animate")[0]).beginElement();
    (<SVGAnimateElement>document.querySelectorAll("#waiting line animate")[1]).beginElement();
}
// 以图搜图
var 识图引擎 = <HTMLSelectElement>document.getElementById("识图引擎");
识图引擎.value = store.get("以图搜图.记住") || store.get("以图搜图.引擎");
识图引擎.oninput = () => {
    if (store.get("以图搜图.记住")) store.set("以图搜图.记住", 识图引擎.value);
    tool_search_f();
};
document.getElementById("tool_search").title = `以图搜图 - ${识图引擎.value}`;
function tool_search_f() {
    var type = 识图引擎.value;
    get_clip_photo("png").then((c: HTMLCanvasElement) => {
        ipcRenderer.send("clip_main_b", "search", [c.toDataURL().replace(/^data:image\/\w+;base64,/, ""), type]);
    });

    scan_line();

    ipcRenderer.on("search_back", (event, arg) => {
        if (arg == "ok") {
            tool_close_f();
            document.getElementById("waiting").style.display = "none";
        } else {
            document.getElementById("waiting").style.display = "none";
        }
    });
}
// 二维码
function tool_QR_f() {
    const jsqr = require("jsqr");
    get_clip_photo("png").then((c: HTMLCanvasElement) => {
        var imageData = c.getContext("2d").getImageData(0, 0, c.width, c.height);
        var code = jsqr(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
        });
        if (code) {
            ipcRenderer.send("clip_main_b", "QR", code.data);
            tool_close_f();
        } else {
            ipcRenderer.send("clip_main_b", "QR", "nothing");
        }
    });
}
// 图片编辑
var drawing = false;
var draw_bar_height = `calc(var(--bar-size) * 6)`;
function tool_draw_f() {
    drawing = drawing ? false : true; // 切换状态
    draw_m(drawing);
    if (!drawing) {
        document.querySelectorAll("#draw_main > div").forEach((ei: HTMLDivElement & { show: boolean }) => {
            ei.show = false;
        });
        draw_bar.style.width = "var(--bar-size)";
        for (const ee of document.querySelectorAll("#draw_main > div")) {
            (<HTMLDivElement>ee).style.backgroundColor = "";
        }
    }
}

function draw_m(v: boolean) {
    drawing = v;
    if (v) {
        // 绘画模式
        document.getElementById("tool_draw").className = "hover_b";
        document.getElementById("clip_photo").style.pointerEvents = "none";
        document.getElementById("clip_wh").style.pointerEvents = "none";
    } else {
        // 裁切模式
        document.getElementById("tool_draw").className = "";
        document.getElementById("clip_photo").style.pointerEvents = "auto";
        hotkeys.setScope("normal");
        fabric_canvas.discardActiveObject();
        fabric_canvas.renderAll();
        mouse_bar_el.style.pointerEvents = document.getElementById("clip_wh").style.pointerEvents = "auto";
    }
}
track_location();

/**
 * 编辑栏跟踪工具栏
 */
function track_location() {
    let h = document.getElementById("tool_bar").offsetTop;
    let l = document.getElementById("tool_bar").offsetLeft + document.getElementById("tool_bar").offsetWidth + 8;
    document.getElementById("draw_bar").setAttribute("right", "true");
    let x =
        document.getElementById("tool_bar").offsetLeft < final_rect[0] &&
        document.getElementById("tool_bar").offsetLeft - document.getElementById("tool_bar").offsetWidth * 2 > 0;
    if (l + 2 * document.getElementById("tool_bar").offsetWidth > document.body.offsetWidth || x) {
        l = document.getElementById("tool_bar").offsetLeft - document.getElementById("draw_bar").offsetWidth - 8;
        let l2 = document.getElementById("tool_bar").offsetLeft - document.getElementById("tool_bar").offsetWidth - 8;
        document.getElementById("draw_bar").setAttribute("right", `calc(${l2}px - var(--bar-size)), ${l2}px`);
    }
    document.getElementById("draw_bar").style.top = `${h}px`;
    document.getElementById("draw_bar").style.left = `${l}px`;
}

// 在其他应用打开
function tool_open_f() {
    open_app();
}

function open_app() {
    const path = require("path");
    const os = require("os");
    const tmp_photo = path.join(os.tmpdir(), "/eSearch/tmp.png");
    const fs = require("fs");
    get_clip_photo("png").then((c: HTMLCanvasElement) => {
        var f = c.toDataURL().replace(/^data:image\/\w+;base64,/, "");
        var dataBuffer = new Buffer(f, "base64");
        fs.writeFile(tmp_photo, dataBuffer, () => {
            var open = require("./lib/open_with");
            open(tmp_photo);
        });
    });
}

const recorder_rect_el = document.getElementById("recorder_rect");
const recorder_mouse_el = document.getElementById("mouse_c");

function tool_record_f() {
    ipcRenderer.send("clip_main_b", "record", final_rect);
    let l = [tool_bar, draw_bar, main_canvas, clip_canvas, draw_canvas, wh_el, mouse_bar_el, lr];

    for (let i of l) {
        i.style.display = "none";
    }

    if (store.get("录屏.提示.键盘.开启") || store.get("录屏.提示.鼠标.开启"))
        var { uIOhook, UiohookKey } = require("uiohook-napi");

    function r_key() {
        var keycode2key = {};

        for (let i in UiohookKey) {
            keycode2key[UiohookKey[i]] = i;
        }
        console.log(keycode2key);

        var key_o = [];

        uIOhook.on("keydown", (e) => {
            if (!key_o.includes(e.keycode)) key_o.push(e.keycode);
            document.getElementById("recorder_key").innerHTML = `<kbd>${key_o
                .map((v) => keycode2key[v])
                .join("</kbd>+<kbd>")}</kbd>`;
        });
        uIOhook.on("keyup", (e) => {
            key_o = key_o.filter((i) => i != e.keycode);
            document.getElementById("recorder_key").innerHTML =
                key_o.length == 0 ? "" : `<kbd>${key_o.map((v) => keycode2key[v]).join("</kbd>+<kbd>")}</kbd>`;
        });
    }

    function r_mouse() {
        var m2m = { 1: 0, 3: 1, 2: 2 };
        var mouse_el = document.getElementById("recorder_mouse").querySelectorAll("div");

        uIOhook.on("mousedown", (e) => {
            mouse_el[m2m[e.button]].style.backgroundColor = "#00f";
        });
        uIOhook.on("mouseup", (e) => {
            mouse_el[m2m[e.button]].style.backgroundColor = "";
        });

        let time_out;
        uIOhook.on("wheel", (e) => {
            mouse_el[1].style.backgroundColor = "#0f0";
            clearTimeout(time_out);
            time_out = setTimeout(() => {
                mouse_el[1].style.backgroundColor = "";
            }, 200);
        });
    }

    if (store.get("录屏.提示.键盘.开启")) r_key();
    if (store.get("录屏.提示.鼠标.开启")) r_mouse();

    if (store.get("录屏.提示.键盘.开启") || store.get("录屏.提示.鼠标.开启")) uIOhook.start();

    if (store.get("录屏.提示.光标.开启")) recorder_mouse_el.style.display = "block";

    var mouse_style = document.createElement("style");
    mouse_style.innerHTML = `.mouse{${store.get("录屏.提示.光标.样式").replaceAll(";", " !important;")}}`;
    document.body.appendChild(mouse_style);
    recorder_rect_el.style.left = final_rect[0] + "px";
    recorder_rect_el.style.top = final_rect[1] + "px";
    recorder_rect_el.style.width = final_rect[2] + "px";
    recorder_rect_el.style.height = final_rect[3] + "px";

    ipcRenderer.on("record", async (event, t, arg) => {
        switch (t) {
            case "mouse":
                recorder_mouse_el.style.left = arg.x + "px";
                recorder_mouse_el.style.top = arg.y + "px";
                break;
        }
    });
}

var log_o = {
    long_list: [] as [HTMLCanvasElement, HTMLCanvasElement][],
    l: [],
    o_canvas: null,
    p: { x: 0, y: 0 },
};
function tool_long_f() {
    let long_list = (log_o.long_list = []);
    init_long(final_rect);
    ipcRenderer.send("clip_main_b", "long_s", final_rect);
    if (!cv) cv = require("opencv.js");
    log_o.o_canvas = document.createElement("canvas");
    let o_canvas = log_o.o_canvas;
    log_o.p = { x: 0, y: 0 };
    let p = log_o.p;
    o_canvas.width = final_rect[2];
    o_canvas.height = final_rect[3];
    log_o.l = [];
    ipcRenderer.on("long", (event, x, w, h) => {
        if (!x) {
            pj_long();
            return;
        }
        let canvas = document.createElement("canvas");
        let canvas_top = document.createElement("canvas");
        canvas.width = clip_canvas.width = draw_canvas.width = w;
        canvas.height = clip_canvas.height = draw_canvas.height = h;
        for (let i = 0; i < x.length; i += 4) {
            [x[i], x[i + 2]] = [x[i + 2], x[i]];
        }
        var d = new ImageData(Uint8ClampedArray.from(x), w, h);
        canvas.getContext("2d").putImageData(d, 0, 0);
        var gid = canvas.getContext("2d").getImageData(final_rect[0], final_rect[1], final_rect[2], final_rect[3]); // 裁剪
        canvas.width = canvas_top.width = final_rect[2];
        canvas.height = final_rect[3];
        canvas_top.height = 200;
        canvas.getContext("2d").putImageData(gid, 0, 0);
        canvas_top.getContext("2d").putImageData(gid, 0, 0);
        long_list.push([canvas, canvas_top]);
        let i = long_list.length - 2;
        if (i < 0) return;
        let src = cv.imread(long_list[i][0]);
        let templ = cv.imread(long_list[i + 1][1]);
        let dst = new cv.Mat();
        let mask = new cv.Mat();
        cv.matchTemplate(src, templ, dst, cv.TM_CCOEFF, mask);
        let result = cv.minMaxLoc(dst, mask);
        let maxPoint = result.maxLoc;
        o_canvas.width += maxPoint.x;
        o_canvas.height += maxPoint.y;
        p.x += maxPoint.x;
        p.y += maxPoint.y;
        log_o.l.push([p.x, p.y]);
        src.delete();
        dst.delete();
        mask.delete();
    });
}

const lr = document.getElementById("long_rect");
function init_long(rect: number[]) {
    let l = [tool_bar, draw_bar, main_canvas, clip_canvas, draw_canvas, wh_el, mouse_bar_el];

    for (let i of l) {
        i.style.display = "none";
    }

    lr.style.left = rect[0] / ratio + "px";
    lr.style.top = rect[1] / ratio + "px";
    lr.style.width = rect[2] / ratio + "px";
    lr.style.height = rect[3] / ratio + "px";
    document.getElementById("long_finish").onclick = () => {
        lr.style.opacity = "0";
        ipcRenderer.send("clip_main_b", "long_e");
        for (let i of l) {
            i.style.display = "";
        }
    };
}

function pj_long() {
    let l = log_o.l,
        long_list = log_o.long_list,
        o_canvas = log_o.o_canvas;
    for (let i = 0; i < long_list.length - 1; i++) {
        o_canvas.getContext("2d").drawImage(long_list[i + 1][0], l[i][0], l[i][1]);
    }
    main_canvas.width = clip_canvas.width = draw_canvas.width = o_canvas.width;
    main_canvas.height = clip_canvas.height = draw_canvas.height = o_canvas.height;

    let ggid = o_canvas.getContext("2d").getImageData(0, 0, o_canvas.width, o_canvas.height);
    main_canvas.getContext("2d").putImageData(ggid, 0, 0);

    final_rect = [0, 0, o_canvas.width, o_canvas.height];
}

// 钉在屏幕上
function tool_ding_f() {
    var ding_window_setting = final_rect;
    get_clip_photo("png").then((c: HTMLCanvasElement) => {
        // @ts-ignore
        ding_window_setting[4] = c.toDataURL();
        ipcRenderer.send("clip_main_b", "ding", ding_window_setting);
        tool_close_f();
    });
}
// 复制
function tool_copy_f() {
    get_clip_photo("png").then((c: HTMLCanvasElement) => {
        clipboard.writeImage(nativeImage.createFromDataURL(c.toDataURL()));
        tool_close_f();
    });
}
// 保存
var type;
function tool_save_f() {
    s_center_bar("save");
    var t_to_n = { png: 0, jpg: 1, svg: 2 };
    var i = t_to_n[store.get("保存.默认格式")];
    document.querySelectorAll("#suffix > div")[i].className = "suffix_h";
    document.getElementById("suffix").onclick = (e) => {
        var el = <HTMLDivElement>e.target;
        if (el.dataset.value) {
            ipcRenderer.send("clip_main_b", "save", el.dataset.value);
            type = el.dataset.value;
            s_center_bar("save");
        }
    };
    hotkeys.setScope("c_bar");
    hotkeys("enter", "c_bar", () => {
        (<HTMLDivElement>document.querySelector("#suffix > .suffix_h")).click();
        s_center_bar("save");
    });
    hotkeys("up", "c_bar", () => {
        document.querySelectorAll("#suffix > div")[i % 3].className = "";
        i = i == 0 ? 2 : i - 1;
        document.querySelectorAll("#suffix > div")[i % 3].className = "suffix_h";
    });
    hotkeys("down", "c_bar", () => {
        document.querySelectorAll("#suffix > div")[i % 3].className = "";
        i++;
        document.querySelectorAll("#suffix > div")[i % 3].className = "suffix_h";
    });
    hotkeys("esc", "c_bar", () => {
        s_center_bar("save");
    });
}
ipcRenderer.on("save_path", (event, message) => {
    console.log(message);
    if (message) {
        const fs = require("fs");
        get_clip_photo(type).then((c) => {
            switch (type) {
                case "svg":
                    var dataBuffer = Buffer.from(<string>c);
                    fs.writeFile(message, dataBuffer, (err) => {
                        if (!err) {
                            ipcRenderer.send("clip_main_b", "ok_save", message);
                        }
                    });
                    break;
                case "png":
                    var f = (<HTMLCanvasElement>c).toDataURL().replace(/^data:image\/\w+;base64,/, "");
                    var dataBuffer = Buffer.from(f, "base64");
                    fs.writeFile(message, dataBuffer, (err) => {
                        if (!err) {
                            ipcRenderer.send("clip_main_b", "ok_save", message);
                        }
                    });
                    break;
                case "jpg":
                    var f = (<HTMLCanvasElement>c)
                        .toDataURL("image/jpeg", store.get("jpg质量") - 0)
                        .replace(/^data:image\/\w+;base64,/, "");
                    var dataBuffer = Buffer.from(f, "base64");
                    fs.writeFile(message, dataBuffer, (err) => {
                        if (!err) {
                            ipcRenderer.send("clip_main_b", "ok_save", message);
                        }
                    });
                    break;
            }
        });
        tool_close_f();
    }
});
var svg;
/**
 * 获取选区图像
 * @param type 格式
 * @returns promise svg base64|canvas element
 */
function get_clip_photo(type: string) {
    var main_ctx = main_canvas.getContext("2d");
    if (!final_rect) final_rect = [0, 0, main_canvas.width, main_canvas.height];

    if (typeof fabric_canvas != "undefined") {
        fabric_canvas.discardActiveObject();
        fabric_canvas.renderAll();
    }

    if (type == "svg") {
        svg = document.createElement("div");
        if (typeof fabric_canvas == "undefined") {
            svg.innerHTML = `<!--?xml version="1.0" encoding="UTF-8" standalone="no" ?-->
            <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="${main_canvas.width}" height="${main_canvas.height}" viewBox="0 0 1920 1080" xml:space="preserve">
            <desc>Created with eSearch</desc>
            </svg>`;
        } else {
            svg.innerHTML = fabric_canvas.toSVG();
            svg.querySelector("desc").innerHTML = "Created with eSearch & Fabric.js";
        }
        svg.querySelector("svg").setAttribute("viewBox", final_rect.join(" "));
        let image = document.createElementNS("http://www.w3.org/2000/svg", "image");
        image.setAttribute("xlink:href", main_canvas.toDataURL());
        svg.querySelector("svg").insertBefore(image, svg.querySelector("svg").firstChild);
        var svg_t = new XMLSerializer().serializeToString(svg.querySelector("svg"));
        return new Promise((resolve, rejects) => {
            resolve(svg_t);
        });
    } else {
        var tmp_canvas = document.createElement("canvas");
        tmp_canvas.width = final_rect[2];
        tmp_canvas.height = final_rect[3];
        var gid = main_ctx.getImageData(final_rect[0], final_rect[1], final_rect[2], final_rect[3]); // 裁剪
        tmp_canvas.getContext("2d").putImageData(gid, 0, 0);
        let image = document.createElement("img");
        if (typeof fabric_canvas != "undefined") {
            image.src = fabric_canvas.toDataURL({
                left: final_rect[0],
                top: final_rect[1],
                width: final_rect[2],
                height: final_rect[3],
                format: type,
            });
            return new Promise((resolve, rejects) => {
                image.onload = () => {
                    tmp_canvas.getContext("2d").drawImage(image, 0, 0, final_rect[2], final_rect[3]);
                    resolve(tmp_canvas);
                };
            });
        } else {
            return new Promise((resolve, rejects) => {
                resolve(tmp_canvas);
            });
        }
    }
}

var tool_position = { x: null, y: null };
tool_bar.addEventListener("mousedown", (e) => {
    tool_bar.style.transition = "none";
    if (e.button == 2) {
        tool_position.x = e.clientX - tool_bar.offsetLeft;
        tool_position.y = e.clientY - tool_bar.offsetTop;
    }
});
tool_bar.addEventListener("mouseup", (e) => {
    tool_bar.style.transition = "";
    if (e.button == 2) tool_position = { x: null, y: null };
});

const { t, lan } = require("./lib/translate/translate");
lan(store.get("语言.语言"));
document.title = t(document.title);

// 初始化刷新
ipcRenderer.on("reflash", () => {
    draw_clip_rect();
    setTimeout(() => {
        wh_bar(final_rect);
    }, 0);
    right_key = false;
    change_right_bar(false);
    ratio = window.devicePixelRatio;
});

const Color = require("color");

// 键盘控制光标
document.querySelector("body").onkeydown = (e) => {
    var o = {
        ArrowUp: "up",
        w: "up",
        ArrowRight: "right",
        d: "right",
        ArrowDown: "down",
        s: "down",
        ArrowLeft: "left",
        a: "left",
    };
    if (e.ctrlKey) {
        ipcRenderer.send("move_mouse", o[e.key], 5);
    } else if (e.shiftKey) {
        ipcRenderer.send("move_mouse", o[e.key], 10);
    } else {
        ipcRenderer.send("move_mouse", o[e.key], 1);
    }
};
// 鼠标框选坐标转画布坐标,鼠标坐标转画布坐标
function p_xy_to_c_xy(canvas, o_x1, o_y1, o_x2, o_y2) {
    // 0_零_1_一_2_二_3 阿拉伯数字为点坐标（canvas），汉字为像素坐标（html）
    // 输入为边框像素坐标
    // 为了让canvas获取全屏，边框像素点要包括
    // 像素坐标转为点坐标后,左和上(小的)是不变的,大的少1
    var x1 = Math.min(o_x1, o_x2);
    var y1 = Math.min(o_y1, o_y2);
    var x2 = Math.max(o_x1, o_x2) + 1;
    var y2 = Math.max(o_y1, o_y2) + 1;
    // canvas缩放变换
    x1 = Math.round(canvas.width * (x1 / canvas.offsetWidth));
    y1 = Math.round(canvas.height * (y1 / canvas.offsetHeight));
    x2 = Math.round(canvas.width * (x2 / canvas.offsetWidth));
    y2 = Math.round(canvas.height * (y2 / canvas.offsetHeight));
    return [x1, y1, x2 - x1, y2 - y1];
}

var selecting = false;
var right_key = false;
var o_position = null;
var canvas_rect = null;
var in_rect = false;
var moving = false;
var oe = null;
var o_final_rect = null;
var the_color = null;
var the_text_color = [null, null];
var clip_ctx = clip_canvas.getContext("2d");
var draw_bar = document.getElementById("draw_bar");
var undo_stack = [{ rect: 0, canvas: 0 }],
    rect_stack = [[0, 0, main_canvas.width, main_canvas.height]],
    canvas_stack = [{}];
var undo_stack_i = 0;
var ratio = window.devicePixelRatio;
var now_canvas_position;
var direction;
var fabric_canvas;
var auto_select_rect = store.get("框选.自动框选.开启");
var moved = false;
var down = false;
var rect_select = false;

// var /**@type {HTMLCanvasElement} */ clip_canvas = clip_canvas;
clip_canvas.onmousedown = (e) => {
    o = true;
    windows_bar_c_o();
    is_in_clip_rect(e);
    if (e.button == 0 && !in_rect) {
        selecting = true;
        o_position = [e.screenX, e.screenY]; // 用于跟随
        canvas_rect = [e.offsetX, e.offsetY]; // 用于框选
        final_rect = p_xy_to_c_xy(clip_canvas, canvas_rect[0], canvas_rect[1], e.offsetX, e.offsetY);
        right_key = false;
        change_right_bar(false);
        draw_bar.style.opacity = document.getElementById("tool_bar").style.opacity = "0";
    }
    if (e.button == 2) {
        right_key = right_key ? false : true;
        // 自由右键取色
        now_canvas_position = p_xy_to_c_xy(clip_canvas, e.offsetX, e.offsetY, e.offsetX, e.offsetY);
        mouse_bar(final_rect, now_canvas_position[0], now_canvas_position[1]);
        // 改成多格式样式
        if (right_key) {
            change_right_bar(true);
        } else {
            change_right_bar(false);
        }
    }
    if (in_rect) {
        is_in_clip_rect(e);
        oe = e;
        o_final_rect = final_rect;
        moving = true;
        move_rect(o_final_rect, oe, oe);
        draw_bar.style.opacity = document.getElementById("tool_bar").style.opacity = "0";
    }
    tool_bar.style.pointerEvents =
        document.getElementById("mouse_bar").style.pointerEvents =
        document.getElementById("clip_wh").style.pointerEvents =
            "none";

    down = true;
};

clip_canvas.onmousemove = (e) => {
    if (down) {
        moved = true;
        rect_select = true;
    }
    if (e.button == 0 && selecting) {
        // 画框
        final_rect = p_xy_to_c_xy(clip_canvas, canvas_rect[0], canvas_rect[1], e.offsetX, e.offsetY);
        draw_clip_rect();
    }
    if (!selecting && !moving) {
        is_in_clip_rect(e);
    }

    if (moving) move_rect(o_final_rect, oe, e);

    if (auto_select_rect && edge_init) {
        in_edge(e);
    }
};

clip_canvas.onmouseup = (e) => {
    if (e.button == 0 && !in_rect) {
        clip_ctx.closePath();
        selecting = false;
        now_canvas_position = p_xy_to_c_xy(clip_canvas, e.offsetX, e.offsetY, e.offsetX, e.offsetY);
        if (!moved && down) {
            rect_select = true;
            let min = [],
                min_n = Infinity;
            for (let i of rect_in_rect) {
                if (i[2] * i[3] < min_n) {
                    min = i;
                    min_n = i[2] * i[3];
                }
            }
            if (min.length != 0) final_rect = min;
            draw_clip_rect();
        } else {
            final_rect = p_xy_to_c_xy(clip_canvas, canvas_rect[0], canvas_rect[1], e.offsetX, e.offsetY);
            draw_clip_rect();
        }
        his_push();
        // 抬起鼠标后工具栏跟随
        follow_bar(e.clientX, e.clientY);
    }
    if (moving) {
        move_rect(o_final_rect, oe, e);
        moving = false;
        o_final_rect = "";
        if (e.button == 0) follow_bar(e.clientX, e.clientY);
        his_push();
    }
    tool_bar.style.pointerEvents =
        document.getElementById("mouse_bar").style.pointerEvents =
        document.getElementById("clip_wh").style.pointerEvents =
            "auto";
    // 框选后默认操作
    if (auto_do != "no" && e.button == 0) {
        eval(`tool_${auto_do}_f()`);
    }

    down = false;
    moved = false;
};

// 画框(遮罩)
function draw_clip_rect() {
    clip_ctx.clearRect(0, 0, clip_canvas.width, clip_canvas.height);
    clip_ctx.beginPath();

    // 框选为黑色遮罩
    clip_ctx.fillStyle = 遮罩颜色;
    clip_ctx.fillRect(0, 0, clip_canvas.width, final_rect[1]);
    clip_ctx.fillRect(0, final_rect[1], final_rect[0], final_rect[3]);
    clip_ctx.fillRect(
        final_rect[0] + final_rect[2],
        final_rect[1],
        clip_canvas.width - (final_rect[0] + final_rect[2]),
        final_rect[3]
    );
    clip_ctx.fillRect(
        0,
        final_rect[1] + final_rect[3],
        clip_canvas.width,
        clip_canvas.height - (final_rect[1] + final_rect[3])
    );

    clip_ctx.fillStyle = 选区颜色;
    clip_ctx.fillRect(final_rect[0], final_rect[1], final_rect[2], final_rect[3]);
    // 大小栏
    wh_bar(final_rect);
}

var rect_in_rect = [];
/**
 * 在边框内
 * @param {MouseEvent} e 鼠标事件
 */
function in_edge(e: MouseEvent) {
    if (rect_select) return;
    rect_in_rect = [];
    for (const i of edge_rect) {
        let x0 = i.x,
            y0 = i.y,
            x1 = i.x + i.width,
            y1 = i.y + i.height;
        if (x0 < e.offsetX && e.offsetX < x1 && y0 < e.offsetY && e.offsetY < y1) {
            rect_in_rect.push([i.x, i.y, i.width, i.height]);
        }
    }
    clip_ctx.clearRect(0, 0, clip_canvas.width, clip_canvas.height);
    clip_ctx.beginPath();
    clip_ctx.strokeStyle = "#000";
    clip_ctx.lineWidth = 1;
    for (let i of rect_in_rect) {
        clip_ctx.strokeRect(i[0], i[1], i[2], i[3]);
    }
}

hotkeys("s", () => {
    rect_select = false;
    final_rect = [0, 0, clip_canvas.width, clip_canvas.height];
    draw_clip_rect();
    document.getElementById("tool_bar").style.opacity = "0";
    tool_bar.style.pointerEvents = "none";
});

var wh_el = document.getElementById("clip_wh");
// 大小栏
function wh_bar(final_rect) {
    // 位置
    var dw = wh_el.offsetWidth,
        dh = wh_el.offsetHeight;
    var x;
    if (dw >= final_rect[2] / ratio) {
        if (dw + final_rect[0] <= main_canvas.offsetWidth) {
            x = final_rect[0] / ratio; // 对齐框的左边
            wh_el.style.right = ``;
            wh_el.style.left = `${x}px`;
        } else {
            wh_el.style.left = ``;
            wh_el.style.right = `0px`;
            // x = final_rect[0] / ratio + final_rect[2] / ratio - dw; // 对齐框的右边
        }
    } else {
        x = final_rect[0] / ratio + final_rect[2] / ratio / 2 - dw / 2;
        wh_el.style.right = ``;
        wh_el.style.left = `${x}px`;
    }
    var y;
    if (final_rect[1] - (dh * ratio + 10) >= 0) {
        y = final_rect[1] - (dh * ratio + 10); // 不超出时在外
    } else {
        if (
            final_rect[1] + final_rect[3] + 10 + document.getElementById("clip_wh").offsetHeight <=
            main_canvas.offsetHeight
        ) {
            y = final_rect[1] + final_rect[3] + 10;
        } else {
            y = final_rect[1] + 10;
        }
    }
    wh_el.style.top = `${y / ratio}px`;
    // 大小文字
    if (四角坐标) {
        var x0, y0, x1, y1, d;
        d = 光标 == "以(1,1)为起点" ? 1 : 0;
        x0 = final_rect[0] + d;
        y0 = final_rect[1] + d;
        x1 = final_rect[0] + d + final_rect[2];
        y1 = final_rect[1] + d + final_rect[3];
        document.getElementById("x0y0").style.display = "block";
        document.getElementById("x1y1").style.display = "block";
        document.getElementById("x0y0").innerHTML = `${x0}, ${y0}`;
        document.getElementById("x1y1").innerHTML = `${x1}, ${y1}`;
    } else {
    }
    document.querySelector("#wh").innerHTML = `${final_rect[2]} × ${final_rect[3]}`;
}

/**
 * 更改x0y0 x1y1 wh
 * @param {string} arg 要改的位置
 */
function 更改大小栏(arg: string) {
    var l = document.querySelector(`#${arg}`).innerHTML.split(/[,×]/);
    l = l.map((string) => {
        // 排除（数字运算符空格）之外的非法输入
        if (string.match(/[\d\+\-*/\.\s\(\)]/g).length != string.length) return null;
        return eval(string);
    });
    var d = 光标 == "以(1,1)为起点" ? 1 : 0;
    if (l != null) {
        switch (arg) {
            case "x0y0":
                final_rect[0] = Number(l[0]) - d;
                final_rect[1] = Number(l[1]) - d;
                break;
            case "x1y1":
                final_rect[0] = Number(l[0]) - final_rect[2] - d;
                final_rect[1] = Number(l[1]) - final_rect[3] - d;
                break;
            case "wh":
                final_rect[2] = Number(l[0]);
                final_rect[3] = Number(l[1]);
                break;
        }
        final_rect_fix();
        his_push();
        draw_clip_rect();
        follow_bar();
    } else {
        var innerHTML = null;
        switch (arg) {
            case "x0y0":
                innerHTML = `${final_rect[0] + d}, ${final_rect[1] + d}`;
                break;
            case "x1y1":
                innerHTML = `${final_rect[0] + d + final_rect[2]}, ${final_rect[1] + d + final_rect[3]}`;
                break;
            case "wh":
                innerHTML = `${final_rect[2]} × ${final_rect[3]}`;
                break;
        }
        document.querySelector(`#${arg}`).innerHTML = innerHTML;
    }
}
wh_el.onkeydown = (e) => {
    if (e.key == "Enter") {
        e.preventDefault();
        更改大小栏((<HTMLElement>e.target).id);
    }
};
document.getElementById("x0y0").onblur = () => {
    更改大小栏("x0y0");
};
document.getElementById("x1y1").onblur = () => {
    更改大小栏("x1y1");
};
document.getElementById("wh").onblur = () => {
    更改大小栏("wh");
};

// 快捷键全屏选择
hotkeys("ctrl+a, command+a", () => {
    final_rect = [0, 0, main_canvas.width, main_canvas.height];
    his_push();
    clip_canvas.style.cursor = "crosshair";
    direction = "none";
    draw_clip_rect();
});

// 生成取色器
var inner_html = "";
for (let i = 1; i <= color_size ** 2; i++) {
    if (i == (color_size ** 2 + 1) / 2) {
        // 光标中心点
        inner_html += `<span id="point_color_t_c"></span>`;
    } else {
        inner_html += `<span id="point_color_t"></span>`;
    }
}
document.querySelector("#point_color").innerHTML = inner_html;
inner_html = null;
var point_color_span_list = document.querySelectorAll("#point_color > span") as NodeListOf<HTMLSpanElement>;

var mouse_bar_el = document.getElementById("mouse_bar");
// 鼠标跟随栏
function mouse_bar(final_rect, x, y) {
    var x0 = final_rect[0],
        x1 = final_rect[0] + final_rect[2],
        y0 = final_rect[1],
        y1 = final_rect[1] + final_rect[3];
    var color = main_canvas
        .getContext("2d")
        .getImageData(x - (color_size - 1) / 2, y - (color_size - 1) / 2, color_size, color_size).data; // 取色器密度
    // 分开每个像素的颜色
    for (var i = 0, len = color.length; i < len; i += 4) {
        var color_g = color.slice(i, i + 4);
        color_g[3] /= 255;
        var ii = parseInt(String(i / 4));
        var xx = (ii % color_size) + (x - (color_size - 1) / 2);
        var yy = parseInt(String(ii / color_size)) + (y - (color_size - 1) / 2);
        if (!(x0 <= xx && xx <= x1 - 1 && y0 <= yy && yy <= y1 - 1) && ii != (color.length / 4 - 1) / 2) {
            // 框外
            point_color_span_list[ii].id = "point_color_t_b";
            point_color_span_list[
                ii
            ].style.background = `rgba(${color_g[0]}, ${color_g[1]}, ${color_g[2]}, ${color_g[3]})`;
        } else if (ii == (color.length / 4 - 1) / 2) {
            // 光标中心点
            point_color_span_list[ii].id = "point_color_t_c";
            point_color_span_list[
                ii
            ].style.background = `rgba(${color_g[0]}, ${color_g[1]}, ${color_g[2]}, ${color_g[3]})`;
            // 颜色文字
            the_color = color_g;
            clip_color_text(the_color, 取色器默认格式);
        } else {
            point_color_span_list[ii].id = "point_color_t_t";
            point_color_span_list[
                ii
            ].style.background = `rgba(${color_g[0]}, ${color_g[1]}, ${color_g[2]}, ${color_g[3]})`;
        }
    }

    if (光标 == "以(1,1)为起点") {
        document.getElementById("clip_xy").innerHTML = `(${x + 1}, ${y + 1})`;
    } else {
        document.getElementById("clip_xy").innerHTML = `(${x}, ${y})`;
    }
}

// 复制坐标
document.getElementById("clip_xy").onclick = () => {
    copy(document.getElementById("clip_xy"));
};

// 色彩空间转换
function color_conversion(rgba, type) {
    var color = Color(rgba);
    switch (type) {
        case "HEX":
            return color.hex();
        case "RGB":
            return color.rgb().string();
        case "HSL":
            var [h, s, l] = color.hsl().round().array();
            return `hsl(${h}, ${s}%, ${l}%)`;
        case "HSV":
            var [h, s, v] = color.hsv().round().array();
            return `hsv(${h}, ${s}%, ${v}%)`;
        case "CMYK":
            var [c, m, y, k] = color.cmyk().round().array();
            return `cmyk(${c}, ${m}, ${y}, ${k})`;
    }
}

// 改变颜色文字和样式
function clip_color_text(l, type) {
    var color = Color.rgb(l);
    var clip_color_text_color = color.isLight() ? "#000" : "#fff";
    the_text_color = [color.hex(), clip_color_text_color];

    (<HTMLDivElement>document.querySelector(`#clip_copy > div > div:not(:nth-child(1))`)).style.backgroundColor =
        the_text_color[0];
    var main_el = <HTMLElement>(
        document.querySelector(`#clip_copy > div > div:not(:nth-child(1)) > div:nth-child(${取色器格式位置})`)
    );
    // 只改变默认格式的字体颜色和内容，并定位展示
    main_el.style.color = the_text_color[1];
    main_el.innerText = color_conversion(the_color, type);
    (<HTMLDivElement>document.querySelector("#clip_copy > div")).style.top = -32 * 取色器格式位置 + "px";
}

// 改变鼠标跟随栏形态，展示所有颜色格式
function change_right_bar(v) {
    // 拼接坐标和颜色代码
    var t = `<div>${final_rect[2]} × ${final_rect[3]}</div>`;
    t += `<div style="background-color:${the_text_color[0]};color:${the_text_color[1]}">`;
    for (let i in all_color_format) {
        t += `<div>${color_conversion(the_color, all_color_format[i])}</div>`;
    }
    document.querySelector("#clip_copy > div").innerHTML = t + "</div>";
    // 复制大小和颜色
    (<HTMLElement>document.querySelector("#clip_copy > div > div:nth-child(1)")).onclick = () => {
        copy(document.querySelector("#clip_copy > div > div:nth-child(1)"));
    };
    var nodes = document.querySelectorAll("#clip_copy > div > div:not(:nth-child(1)) > div");
    nodes.forEach((element: HTMLElement) => {
        ((e) => {
            e.onclick = () => {
                copy(e);
            };
        })(element);
    });
    if (v) {
        document.getElementById("point_color").style.height = "0";
        document.getElementById("clip_copy").className = "clip_copy";
        document.getElementById("mouse_bar").style.pointerEvents = "auto";
    } else {
        document.getElementById("clip_copy").className = "clip_copy_h";
        document.getElementById("point_color").style.height = "";
        document.getElementById("mouse_bar").style.pointerEvents = "none";
    }
}
change_right_bar(false);

/**
 * 复制内容
 * @param e 要复制内容的元素
 */
function copy(e: HTMLElement) {
    clipboard.writeText(e.innerText);
    right_key = false;
    change_right_bar(false);
}

hotkeys(store.get("其他快捷键.复制颜色"), () => {
    copy(document.querySelector(`#clip_copy > div > div:not(:nth-child(1)) > div:nth-child(${取色器格式位置})`));
});

// 初始化鼠标栏
document.onmouseenter = () => {
    mouse_bar_el.style.display = "flex";
};

// 鼠标栏实时跟踪
document.onmousemove = (e) => {
    if (!right_key) {
        if (clip_canvas.offsetWidth != 0) {
            // 鼠标位置文字
            var c_rect = (<HTMLElement>e.target).getBoundingClientRect();
            var c_x = e.offsetX + c_rect.left;
            var c_y = e.offsetY + c_rect.top;
            now_canvas_position = p_xy_to_c_xy(clip_canvas, c_x, c_y, c_x, c_y);
            // 鼠标跟随栏
            mouse_bar(final_rect, now_canvas_position[0], now_canvas_position[1]);
        }
        // 鼠标跟随栏

        var x = e.clientX + 16;
        var y = e.clientY + 16;
        var w = mouse_bar_el.offsetWidth;
        var h = mouse_bar_el.offsetHeight;
        var sw = window.screen.width;
        var sh = window.screen.height;
        if (x + w > sw) {
            x = x - w - 32;
        }
        if (y + h > sh) {
            y = y - h - 32;
        }

        mouse_bar_el.style.left = `${x}px`;
        mouse_bar_el.style.top = `${y}px`;

        if (draw_bar.contains(e.target as HTMLElement) || tool_bar.contains(e.target as HTMLElement)) {
            mouse_bar_el.classList.add("mouse_bar_hide");
        } else {
            mouse_bar_el.classList.remove("mouse_bar_hide");
        }

        // 画板栏移动
        if (draw_bar_moving) {
            draw_bar.style.left = e.clientX - draw_bar_moving_xy[0] + "px";
            draw_bar.style.top = e.clientY - draw_bar_moving_xy[1] + "px";
        }
    }
    if (tool_position.x) {
        tool_bar.style.left = e.clientX - tool_position.x + "px";
        tool_bar.style.top = e.clientY - tool_position.y + "px";
        track_location();
    }
};

// 工具栏跟随
var follow_bar_list = [[0, 0]];
/**
 * 工具栏自动跟随
 * @param x x坐标
 * @param y y坐标
 */
function follow_bar(x?: number, y?: number) {
    if (!x && !y) {
        var dx = undo_stack[undo_stack.length - 1][0] - undo_stack[undo_stack.length - 2][0];
        var dy = undo_stack[undo_stack.length - 1][1] - undo_stack[undo_stack.length - 2][1];
        x = follow_bar_list[follow_bar_list.length - 1][0] + dx / ratio;
        y = follow_bar_list[follow_bar_list.length - 1][1] + dy / ratio;
    }
    follow_bar_list.push([x, y]);
    let [x1, y1] = [final_rect[0] / ratio, final_rect[1] / ratio];
    let x2 = x1 + final_rect[2] / ratio;
    let y2 = y1 + final_rect[3] / ratio;
    let max_width = window.screen.width / 全局缩放;
    let max_height = window.screen.height / 全局缩放;
    if ((x1 + x2) / 2 <= x) {
        // 向右
        if (x2 + tool_bar.offsetWidth + 10 <= max_width) {
            tool_bar.style.left = x2 + 10 + "px"; // 贴右边
        } else {
            if (工具栏跟随 == "展示内容优先") {
                // 超出屏幕贴左边
                if (x1 - tool_bar.offsetWidth - 10 >= 0) {
                    tool_bar.style.left = x1 - tool_bar.offsetWidth - 10 + "px";
                } else {
                    // 还超贴右内
                    tool_bar.style.left = x2 - tool_bar.offsetWidth - 10 + "px";
                }
            } else {
                // 直接贴右边,即使遮挡
                tool_bar.style.left = x2 - tool_bar.offsetWidth - 10 + "px";
            }
        }
    } else {
        // 向左
        if (x1 - tool_bar.offsetWidth - 10 >= 0) {
            tool_bar.style.left = x1 - tool_bar.offsetWidth - 10 + "px"; // 贴左边
        } else {
            if (工具栏跟随 == "展示内容优先") {
                // 超出屏幕贴右边
                if (x2 + tool_bar.offsetWidth + 10 <= max_width) {
                    tool_bar.style.left = x2 + 10 + "px";
                } else {
                    // 还超贴左内
                    tool_bar.style.left = x1 + 10 + "px";
                }
            } else {
                tool_bar.style.left = x1 + 10 + "px";
            }
        }
    }

    if (y >= (y1 + y2) / 2) {
        if (y2 - tool_bar.offsetHeight >= 0) {
            tool_bar.style.top = y2 - tool_bar.offsetHeight + "px";
        } else {
            if (y1 + tool_bar.offsetHeight > max_height) {
                tool_bar.style.top = max_height - tool_bar.offsetHeight + "px";
            } else {
                tool_bar.style.top = y1 + "px";
            }
        }
    } else {
        if (y1 + tool_bar.offsetHeight <= max_height) {
            tool_bar.style.top = y1 + "px";
        } else {
            tool_bar.style.top = max_height - tool_bar.offsetHeight + "px";
        }
    }
    draw_bar.style.opacity = document.getElementById("tool_bar").style.opacity = "1";
    track_location();
}

// 移动画画栏
var draw_bar_moving = false;
var draw_bar_moving_xy = [];
document.getElementById("draw_bar").addEventListener("mousedown", (e) => {
    if (e.button != 0) {
        draw_bar_moving = true;
        draw_bar_moving_xy[0] = e.clientX - document.getElementById("draw_bar").offsetLeft;
        draw_bar_moving_xy[1] = e.clientY - document.getElementById("draw_bar").offsetTop;
        draw_bar.style.transition = "0s";
    }
});
document.getElementById("draw_bar").addEventListener("mouseup", (e) => {
    if (e.button != 0) {
        draw_bar_moving = false;
        draw_bar_moving_xy = [];
        draw_bar.style.transition = "";
    }
});

// 修复final_rect负数
// 超出屏幕处理
function final_rect_fix() {
    final_rect = final_rect.map((i) => Math.round(i));
    var x0 = final_rect[0];
    var y0 = final_rect[1];
    var x1 = final_rect[0] + final_rect[2];
    var y1 = final_rect[1] + final_rect[3];
    var x = Math.min(x0, x1),
        y = Math.min(y0, y1);
    var w = Math.max(x0, x1) - x,
        h = Math.max(y0, y1) - y;
    // 移出去移回来保持原来大小
    if (x < 0) w = x = 0;
    if (y < 0) h = y = 0;
    if (x > main_canvas.width) x = x % main_canvas.width;
    if (y > main_canvas.height) y = y % main_canvas.height;
    if (x + w > main_canvas.width) w = main_canvas.width - x;
    if (y + h > main_canvas.height) h = main_canvas.height - y;
    final_rect = [x, y, w, h];
}

// 判断光标位置并更改样式
// 定义光标位置的移动方向
function is_in_clip_rect(event) {
    now_canvas_position = p_xy_to_c_xy(clip_canvas, event.offsetX, event.offsetY, event.offsetX, event.offsetY);
    var x = now_canvas_position[0],
        y = now_canvas_position[1];
    var x0 = final_rect[0],
        x1 = final_rect[0] + final_rect[2],
        y0 = final_rect[1],
        y1 = final_rect[1] + final_rect[3];
    // 如果全屏,那允许框选
    if (!(final_rect[2] == main_canvas.width && final_rect[3] == main_canvas.height)) {
        if (x0 <= x && x <= x1 && y0 <= y && y <= y1) {
            // 在框选区域内,不可框选,只可调整
            in_rect = true;
        } else {
            in_rect = false;
        }

        direction = "";

        var num = 8;

        // 光标样式
        switch (true) {
            case x0 <= x && x <= x0 + num && y0 <= y && y <= y0 + num:
                clip_canvas.style.cursor = "nwse-resize";
                direction = "西北";
                break;
            case x1 - num <= x && x <= x1 && y1 - num <= y && y <= y1:
                clip_canvas.style.cursor = "nwse-resize";
                direction = "东南";
                break;
            case y0 <= y && y <= y0 + num && x1 - num <= x && x <= x1:
                clip_canvas.style.cursor = "nesw-resize";
                direction = "东北";
                break;
            case y1 - num <= y && y <= y1 && x0 <= x && x <= x0 + num:
                clip_canvas.style.cursor = "nesw-resize";
                direction = "西南";
                break;
            case x0 <= x && x <= x0 + num:
                clip_canvas.style.cursor = "ew-resize";
                direction = "西";
                break;
            case x1 - num <= x && x <= x1:
                clip_canvas.style.cursor = "ew-resize";
                direction = "东";
                break;
            case y0 <= y && y <= y0 + num:
                clip_canvas.style.cursor = "ns-resize";
                direction = "北";
                break;
            case y1 - num <= y && y <= y1:
                clip_canvas.style.cursor = "ns-resize";
                direction = "南";
                break;
            case x0 + num < x && x < x1 - num && y0 + num < y && y < y1 - num:
                clip_canvas.style.cursor = "move";
                direction = "move";
                break;
            default:
                clip_canvas.style.cursor = "crosshair";
                direction = "";
                break;
        }
    } else {
        // 全屏可框选
        clip_canvas.style.cursor = "crosshair";
        direction = "";
        in_rect = false;
    }
}

// 调整框选
function move_rect(o_final_rect, oe, e) {
    var op = p_xy_to_c_xy(clip_canvas, oe.offsetX, oe.offsetY, oe.offsetX, oe.offsetY);
    var p = p_xy_to_c_xy(clip_canvas, e.offsetX, e.offsetY, e.offsetX, e.offsetY);
    var dx = p[0] - op[0],
        dy = p[1] - op[1];
    switch (direction) {
        case "西北":
            final_rect = [o_final_rect[0] + dx, o_final_rect[1] + dy, o_final_rect[2] - dx, o_final_rect[3] - dy];
            break;
        case "东南":
            final_rect = [o_final_rect[0], o_final_rect[1], o_final_rect[2] + dx, o_final_rect[3] + dy];
            break;
        case "东北":
            final_rect = [o_final_rect[0], o_final_rect[1] + dy, o_final_rect[2] + dx, o_final_rect[3] - dy];
            break;
        case "西南":
            final_rect = [o_final_rect[0] + dx, o_final_rect[1], o_final_rect[2] - dx, o_final_rect[3] + dy];
            break;
        case "西":
            final_rect = [o_final_rect[0] + dx, o_final_rect[1], o_final_rect[2] - dx, o_final_rect[3]];
            break;
        case "东":
            final_rect = [o_final_rect[0], o_final_rect[1], o_final_rect[2] + dx, o_final_rect[3]];
            break;
        case "北":
            final_rect = [o_final_rect[0], o_final_rect[1] + dy, o_final_rect[2], o_final_rect[3] - dy];
            break;
        case "南":
            final_rect = [o_final_rect[0], o_final_rect[1], o_final_rect[2], o_final_rect[3] + dy];
            break;
        case "move":
            final_rect = [o_final_rect[0] + dx, o_final_rect[1] + dy, o_final_rect[2], o_final_rect[3]];
            break;
    }
    if (final_rect[0] < 0) {
        final_rect[2] = final_rect[2] + final_rect[0];
        final_rect[0] = 0;
    }
    if (final_rect[1] < 0) {
        final_rect[3] = final_rect[3] + final_rect[1];
        final_rect[1] = 0;
    }
    if (final_rect[0] + final_rect[2] > main_canvas.width) final_rect[2] = main_canvas.width - final_rect[0];
    if (final_rect[1] + final_rect[3] > main_canvas.height) final_rect[3] = main_canvas.height - final_rect[1];

    final_rect_fix();
    draw_clip_rect();
}

/**
 * 保存历史
 */
function his_push() {
    // 撤回到中途编辑，复制撤回的这一位置参数与编辑的参数一起放到末尾
    if (undo_stack_i != undo_stack.length - 1 && undo_stack.length >= 2) undo_stack.push(undo_stack[undo_stack_i]);

    let final_rect_v = [final_rect[0], final_rect[1], final_rect[2], final_rect[3]]; // 防止引用源地址导致后续操作-2个被改变
    let canvas = fabric_canvas?.toJSON() || {};

    if (rect_stack[rect_stack.length - 1] + "" != final_rect_v + "") rect_stack.push(final_rect_v);
    if (JSON.stringify(canvas_stack[canvas_stack.length - 1]) != JSON.stringify(canvas)) canvas_stack.push(canvas);

    undo_stack.push({ rect: rect_stack.length - 1, canvas: canvas_stack.length - 1 });
    undo_stack_i = undo_stack.length - 1;
}
/**
 * 更改历史指针
 * @param {boolean} v true向前 false向后
 */
function undo(v: boolean) {
    if (v) {
        if (undo_stack_i > 0) {
            undo_stack_i--;
        }
    } else {
        if (undo_stack_i < undo_stack.length - 1) {
            undo_stack_i++;
        }
    }
    var c = undo_stack[undo_stack_i];
    final_rect = rect_stack[c.rect];
    draw_clip_rect();
    follow_bar();
    if (fabric_canvas) fabric_canvas.loadFromJSON(canvas_stack[c.canvas]);
}

hotkeys("ctrl+z", "normal", () => {
    undo(true);
});
hotkeys("ctrl+y", "normal", () => {
    undo(false);
});

document.getElementById("操作_撤回").onclick = () => {
    undo(true);
};
document.getElementById("操作_重做").onclick = () => {
    undo(false);
};
document.getElementById("操作_复制").onclick = () => {
    fabric_copy();
};
document.getElementById("操作_删除").onclick = () => {
    fabric_delete();
};

const { fabric } = require("./lib/fabric.min.js");
var fabric_canvas = new fabric.Canvas("draw_photo");

var canvas_container = <HTMLCanvasElement>document.querySelector(".canvas-container");
var upper_canvas = <HTMLCanvasElement>document.querySelector(".upper-canvas");
draw_canvas.style.width = canvas_container.style.width = upper_canvas.style.width = main_canvas.width / ratio + "px";
draw_canvas.style.height = canvas_container.style.height = upper_canvas.style.height = "auto";

his_push();

var fill_color = store.get("图像编辑.默认属性.填充颜色");
var stroke_color = store.get("图像编辑.默认属性.边框颜色");
var stroke_width = store.get("图像编辑.默认属性.边框宽度");
var free_color = store.get("图像编辑.默认属性.画笔颜色");
var free_width = store.get("图像编辑.默认属性.画笔粗细");
var shadow_blur = 0;

// 编辑栏
document.querySelectorAll("#draw_main > div").forEach((e: HTMLDivElement & { show: boolean }, index) => {
    (<HTMLElement>document.querySelectorAll("#draw_side > div")[index]).style.height = "0";
    e.onmouseenter = show;
    e.addEventListener("click", () => {
        draw_m(!e.show);
        if (e.show) {
            e.show = !e.show;
            (<HTMLElement>document.querySelectorAll("#draw_side > div")[index]).style.height = "0";
            draw_bar.style.width = "var(--bar-size)";
            for (const ee of document.querySelectorAll("#draw_main > div")) {
                (<HTMLDivElement>ee).style.backgroundColor = "";
            }
            if (draw_bar.getAttribute("right") != "true") {
                draw_bar.style.transition = "var(--transition)";
                draw_bar.style.left = draw_bar.getAttribute("right").split(",")[1];
                setTimeout(() => {
                    draw_bar.style.transition = "";
                }, 400);
            }
        } else {
            show();
        }
    });
    function show() {
        draw_bar.style.width = "calc(var(--bar-size) * 2)";
        for (const ee of document.querySelectorAll("#draw_main > div")) {
            (<HTMLDivElement>ee).style.backgroundColor = "";
        }
        e.style.backgroundColor = "var(--hover-color)";
        if (draw_bar.getAttribute("right") != "true") {
            draw_bar.style.transition = "var(--transition)";
            draw_bar.style.left = draw_bar.getAttribute("right").split(",")[0];
            setTimeout(() => {
                draw_bar.style.transition = "";
            }, 400);
        }
        document.querySelectorAll("#draw_main > div").forEach((ei: HTMLDivElement & { show: boolean }) => {
            ei.show = false;
        });
        e.show = !e.show;
        document.querySelectorAll("#draw_side > div").forEach((ei: HTMLDivElement) => {
            ei.style.height = "0";
        });
        var h = 0;
        Array.from(document.querySelectorAll("#draw_side > div")[index].children).forEach((e: HTMLDivElement) => {
            h += e.offsetHeight;
        });
        if (h > Number(draw_bar_height)) {
            h = Number(draw_bar_height);
        }
        (<HTMLDivElement>document.querySelectorAll("#draw_side > div")[index]).style.height = h + "px";
    }
});

var free_i_els = document.querySelectorAll("#draw_free_i > lock-b") as NodeListOf<HTMLInputElement>;

// 笔
var pencil_el = <HTMLInputElement>document.getElementById("draw_free_pencil");
pencil_el.oninput = () => {
    fabric_canvas.isDrawingMode = pencil_el.checked;
    get_f_object_v();
    if (pencil_el.checked) {
        free_i_els[1].checked = false;
        free_i_els[2].checked = false;

        fabric_canvas.freeDrawingBrush = new fabric.PencilBrush(fabric_canvas);
        fabric_canvas.freeDrawingBrush.color = free_color;
        fabric_canvas.freeDrawingBrush.width = free_width;
        free_shadow();
    }
    exit_shape();
    exit_filter();
    free_draw_cursor();
};
// 橡皮
var eraser_el = <HTMLInputElement>document.getElementById("draw_free_eraser");
eraser_el.oninput = () => {
    fabric_canvas.isDrawingMode = eraser_el.checked;
    get_f_object_v();
    if (eraser_el.checked) {
        free_i_els[0].checked = false;
        free_i_els[2].checked = false;

        fabric_canvas.freeDrawingBrush = new fabric.EraserBrush(fabric_canvas);
        fabric_canvas.freeDrawingBrush.width = free_width;
    }
    exit_shape();
    exit_filter();
    free_draw_cursor();
};
// 刷
var free_spray_el = <HTMLInputElement>document.getElementById("draw_free_spray");
free_spray_el.oninput = () => {
    fabric_canvas.isDrawingMode = free_spray_el.checked;
    get_f_object_v();
    if (free_spray_el.checked) {
        free_i_els[0].checked = false;
        free_i_els[1].checked = false;

        fabric_canvas.freeDrawingBrush = new fabric.SprayBrush(fabric_canvas);
        fabric_canvas.freeDrawingBrush.color = free_color;
        fabric_canvas.freeDrawingBrush.width = free_width;
    }
    exit_shape();
    exit_filter();
    free_draw_cursor();
};
// 阴影
(<HTMLInputElement>document.querySelector("#shadow_blur > range-b")).oninput = free_shadow;

function free_shadow() {
    shadow_blur = Number((<HTMLInputElement>document.querySelector("#shadow_blur > range-b")).value);
    fabric_canvas.freeDrawingBrush.shadow = new fabric.Shadow({
        blur: shadow_blur,
        color: free_color,
    });
}

function free_draw_cursor() {
    var mode = "free";
    if (pencil_el.checked) mode = "free";
    if (eraser_el.checked) mode = "eraser";
    if (free_spray_el.checked) mode = "spray";
    if (mode == "free" || mode == "eraser") {
        var svg_w = free_width,
            h_w = svg_w / 2,
            r = free_width / 2;
        if (svg_w < 10) {
            svg_w = 10;
            h_w = 5;
        }
        if (mode == "free") {
            var svg = `<svg width="${svg_w}" height="${svg_w}" xmlns="http://www.w3.org/2000/svg"><line x1="0" x2="${svg_w}" y1="${h_w}" y2="${h_w}" stroke="#000"/><line y1="0" y2="${svg_w}" x1="${h_w}" x2="${h_w}" stroke="#000"/><circle style="fill:${free_color};" cx="${h_w}" cy="${h_w}" r="${r}"/></svg>`;
        } else {
            var svg = `<svg width="${svg_w}" height="${svg_w}" xmlns="http://www.w3.org/2000/svg"><line x1="0" x2="${svg_w}" y1="${h_w}" y2="${h_w}" stroke="#000"/><line y1="0" y2="${svg_w}" x1="${h_w}" x2="${h_w}" stroke="#000"/><circle style="stroke-width:1;stroke:#000;fill:none" cx="${h_w}" cy="${h_w}" r="${r}"/></svg>`;
        }
        var d = document.createElement("div");
        d.innerHTML = svg;
        var s = new XMLSerializer().serializeToString(d.querySelector("svg"));
        var cursorUrl = `data:image/svg+xml;base64,` + window.btoa(s);
        fabric_canvas.freeDrawingCursor = `url(" ${cursorUrl} ") ${h_w} ${h_w}, auto`;
    } else {
        fabric_canvas.freeDrawingCursor = `auto`;
    }
}

// 几何
var shape = "";
document.getElementById("draw_shapes_i").onclick = (e) => {
    let el = <HTMLElement>e.target;
    exit_shape();
    if (el.id != "draw_shapes_i") {
        shape = el.id.replace("draw_shapes_", ""); // 根据元素id命名为shape赋值
        if (store.get(`图像编辑.形状属性.${shape}`)) {
            let f = store.get(`图像编辑.形状属性.${shape}.fc`);
            let s = store.get(`图像编辑.形状属性.${shape}.sc`);
            change_color({ fill: f, stroke: s }, false, true);
            fill_color = f;
            stroke_color = s;
            stroke_width = store.get(`图像编辑.形状属性.${shape}.sw`);
            (<HTMLInputElement>document.querySelector("#draw_stroke_width > range-b")).value = stroke_width;
        }
    }
    exit_free();
    exit_filter();
    fabric_canvas.defaultCursor = "crosshair";
    hotkeys.setScope("drawing_esc");
};
// 层叠位置
document.getElementById("draw_position_i").onclick = (e) => {
    switch ((<HTMLElement>e.target).id) {
        case "draw_position_front":
            fabric_canvas.getActiveObject().bringToFront();
            break;
        case "draw_position_forwards":
            fabric_canvas.getActiveObject().bringForward();
            break;
        case "draw_position_backwards":
            fabric_canvas.getActiveObject().sendBackwards();
            break;
        case "draw_position_back":
            fabric_canvas.getActiveObject().sendToBack();
            break;
    }
};

// 删除快捷键
hotkeys("delete", fabric_delete);
function fabric_delete() {
    for (let o of fabric_canvas.getActiveObject()._objects || [fabric_canvas.getActiveObject()]) {
        fabric_canvas.remove(o);
    }
    get_f_object_v();
    get_filters();
    his_push();
}

var drawing_shape = false;
var shapes = [];
var unnormal_shapes = ["polyline", "polygon", "number"];
var draw_o_p = []; // 首次按下的点
var poly_o_p = []; // 多边形点
var new_filter_o = null;
var draw_number_n = 1;

fabric_canvas.on("mouse:down", (options) => {
    // 非常规状态下点击
    if (shape != "") {
        drawing_shape = true;
        fabric_canvas.selection = false;
        // 折线与多边形要多次点击，在poly_o_p存储点
        if (!unnormal_shapes.includes(shape)) {
            draw_o_p = [options.e.offsetX, options.e.offsetY];
            draw(shape, "start", draw_o_p[0], draw_o_p[1], options.e.offsetX, options.e.offsetY);
        } else {
            // 定义最后一个点,双击,点重复,结束
            var poly_o_p_l = poly_o_p[poly_o_p.length - 1];
            if (!(options.e.offsetX == poly_o_p_l?.x && options.e.offsetY == poly_o_p_l?.y)) {
                poly_o_p.push({ x: options.e.offsetX, y: options.e.offsetY });
                if (shape == "number") {
                    draw_number();
                } else {
                    draw_poly(shape);
                }
            } else {
                his_push();
                shape = "";
                poly_o_p = [];
                draw_number_n = 1;
                fabric_canvas.defaultCursor = "auto";
            }
        }
    }

    if (new_filter_selecting) {
        new_filter_o = fabric_canvas.getPointer(options.e);
    }
});
fabric_canvas.on("mouse:move", (options) => {
    if (drawing_shape) {
        if (!unnormal_shapes.includes(shape)) {
            draw(shape, "move", draw_o_p[0], draw_o_p[1], options.e.offsetX, options.e.offsetY);
        }
    }
});
fabric_canvas.on("mouse:up", (options) => {
    if (!unnormal_shapes.includes(shape)) {
        drawing_shape = false;
        fabric_canvas.selection = true;
        fabric_canvas.defaultCursor = "auto";
        if (shape != "") {
            fabric_canvas.setActiveObject(shapes[shapes.length - 1]);
            his_push();
        }
        shape = "";
        hotkeys.setScope("normal");
    }

    get_f_object_v();
    get_filters();

    if (new_filter_selecting) {
        new_filter_select(new_filter_o, fabric_canvas.getPointer(options.e));
        new_filter_selecting = false;
        (<HTMLInputElement>(<HTMLInputElement>document.querySelector("#draw_filters_select > lock-b"))).checked = false;
        fabric_canvas.defaultCursor = "auto";
        get_filters();
        his_push();
        hotkeys.setScope("normal");
    }

    if (fabric_canvas.isDrawingMode) {
        his_push();
    }
});

// 画一般图形
function draw(shape, v, x1, y1, x2, y2) {
    if (v == "move") {
        fabric_canvas.remove(shapes[shapes.length - 1]);
        shapes.splice(shapes.length - 1, 1);
    }
    var [x, y, w, h] = p_xy_to_c_xy(draw_canvas, x1, y1, x2, y2);
    switch (shape) {
        case "line":
            shapes[shapes.length] = new fabric.Line([x1, y1, x2, y2], {
                stroke: stroke_color,
                形状: "line",
            });
            break;
        case "circle":
            shapes[shapes.length] = new fabric.Circle({
                radius: Math.max(w / ratio, h / ratio) / 2,
                left: x / ratio,
                top: y / ratio,
                fill: fill_color,
                stroke: stroke_color,
                strokeWidth: stroke_width,
                canChangeFill: true,
                形状: "circle",
            });
            break;
        case "rect":
            shapes[shapes.length] = new fabric.Rect({
                left: x / ratio,
                top: y / ratio,
                width: w / ratio,
                height: h / ratio,
                fill: fill_color,
                stroke: stroke_color,
                strokeWidth: stroke_width,
                canChangeFill: true,
                形状: "rect",
            });
            break;
        case "text":
            shapes.push(
                new fabric.IText("点击输入文字", {
                    left: x / ratio,
                    top: y / ratio,
                    canChangeFill: true,
                    形状: "text",
                })
            );
            break;
        case "arrow":
            let line = new fabric.Line([x1, y1, x2, y2], {
                stroke: stroke_color,
            });
            let t = new fabric.Triangle({
                width: 20,
                height: 25,
                fill: stroke_color,
                left: x2,
                top: y2,
                originX: "center",
                angle: (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI + 90,
            });
            shapes.push(new fabric.Group([line, t]));
            break;
        default:
            break;
    }
    fabric_canvas.add(shapes[shapes.length - 1]);
}
// 多边形
function draw_poly(shape) {
    if (poly_o_p.length != 1) {
        fabric_canvas.remove(shapes[shapes.length - 1]);
        shapes.splice(shapes.length - 1, 1);
    }
    if (shape == "polyline") {
        shapes.push(
            new fabric.Polyline(poly_o_p, {
                fill: "#0000",
                stroke: stroke_color,
                strokeWidth: stroke_width,
                形状: "polyline",
            })
        );
    }
    if (shape == "polygon") {
        shapes.push(
            new fabric.Polygon(poly_o_p, {
                fill: fill_color,
                stroke: stroke_color,
                strokeWidth: stroke_width,
                canChangeFill: true,
                形状: "polygon",
            })
        );
    }
    fabric_canvas.add(shapes[shapes.length - 1]);
}

function draw_number() {
    draw_number_n = Number(shapes?.[shapes.length - 1]?.text) + 1 || draw_number_n;
    let p = poly_o_p[poly_o_p.length - 1];

    let txt = new fabric.IText(String(draw_number_n), {
        left: p.x,
        top: p.y,
        fontSize: 16,
        originX: "center",
        originY: "center",
        canChangeFill: true,
    });
    let cr = new fabric.Circle({
        radius: 10,
        left: p.x,
        top: p.y,
        originX: "center",
        originY: "center",
        fill: fill_color,
        stroke: stroke_color,
        strokeWidth: stroke_width,
        canChangeFill: true,
    });
    shapes.push(cr);
    shapes.push(txt);
    fabric_canvas.add(shapes[shapes.length - 2]);
    fabric_canvas.add(shapes[shapes.length - 1]);
    fabric_canvas.setActiveObject(txt);
    txt.enterEditing();

    draw_number_n++;
}

// 颜色选择
var color_m = "fill";
var color_fill_el = document.getElementById("draw_color_fill");
color_fill_el.onfocus = () => {
    color_m = "fill";
};
var color_stroke_el = document.getElementById("draw_color_stroke");
color_stroke_el.onfocus = () => {
    color_m = "stroke";
};
// 输入颜色
var color_alpha_input_1 = <HTMLInputElement>document.querySelector("#draw_color_alpha > range-b:nth-child(1)");
color_fill_el.oninput = () => {
    change_color({ fill: color_fill_el.innerText }, true, false);
    var fill_a = Color(color_fill_el.innerText).valpha;
    color_alpha_input_1.value = String(Math.round(fill_a * 100));
};
var color_alpha_input_2 = <HTMLInputElement>document.querySelector("#draw_color_alpha > range-b:nth-child(2)");
color_stroke_el.oninput = () => {
    change_color({ stroke: color_stroke_el.innerText }, true, false);
    var stroke_a = Color(color_stroke_el.innerText).valpha;
    color_alpha_input_2.value = String(Math.round(stroke_a * 100));
};

// 改变透明度
color_alpha_input_1.oninput = () => {
    change_alpha(color_alpha_input_1.value, "fill");
};
color_alpha_input_2.oninput = () => {
    change_alpha(color_alpha_input_2.value, "stroke");
};
function change_alpha(v, m) {
    var rgba = Color(document.getElementById(`draw_color_${m}`).style.backgroundColor)
        .rgb()
        .array();
    rgba[3] = v / 100;
    change_color({ [m]: rgba }, true, true);
}

// 刷新控件颜色
/**
 * 改变颜色
 * @param {{fill?: String, stroke?: String}} m_l
 * @param {Boolean} set_o 是否改变选中形状样式
 * @param {Boolean} text 是否更改文字，仅在input时为true
 */
function change_color(m_l: { fill?: string; stroke?: string }, set_o: boolean, text: boolean) {
    for (let i in m_l) {
        var color_m = i,
            color = m_l[i];
        if (color === null) color = "#0000";
        var color_l = Color(color).rgb().array();
        document.getElementById(`draw_color_${color_m}`).style.backgroundColor = Color(color_l).string();
        if (color_m == "fill") {
            (<HTMLDivElement>document.querySelector("#draw_color > div")).style.backgroundColor =
                Color(color_l).string();
            if (set_o) set_f_object_v(Color(color_l).string(), null, null);
        }
        if (color_m == "stroke") {
            (<HTMLDivElement>document.querySelector("#draw_color > div")).style.borderColor = Color(color_l).string();
            if (set_o) set_f_object_v(null, Color(color_l).string(), null);
        }

        // 文字自适应
        var t_color = Color(document.getElementById(`draw_color_${color_m}`).style.backgroundColor);
        var bg_color = Color(getComputedStyle(document.documentElement).getPropertyValue("--bar-bg").replace(" ", ""));
        if (t_color.rgb().array()[3] >= 0.5 || t_color.rgb().array()[3] === undefined) {
            if (t_color.isLight()) {
                document.getElementById(`draw_color_${color_m}`).style.color = "#000";
            } else {
                document.getElementById(`draw_color_${color_m}`).style.color = "#fff";
            }
        } else {
            // 低透明度背景呈现栏的颜色
            if (bg_color.isLight()) {
                document.getElementById(`draw_color_${color_m}`).style.color = "#000";
            } else {
                document.getElementById(`draw_color_${color_m}`).style.color = "#fff";
            }
        }

        if (text) {
            document.getElementById(`draw_color_${color_m}`).innerText = Color(color).hexa();
        }
    }
}

// 色盘
function color_bar() {
    // 主盘
    var color_list = ["hsl(0, 0%, 100%)"];
    var base_color = Color("hsl(0, 100%, 50%)");
    for (let i = 0; i < 360; i += 15) {
        color_list.push(base_color.rotate(i).string());
    }
    show_color();
    // 下一层级
    function next_color(h) {
        var next_color_list = [];
        if (h == "hsl(0, 0%, 100%)") {
            for (let i = 255; i >= 0; i = Number((i - 10.625).toFixed(3))) {
                next_color_list.push(`rgb(${i}, ${i}, ${i})`);
            }
        } else {
            h = h.match(/hsl\(([0-9]*)/)[1] - 0;
            for (let i = 90; i > 0; i -= 20) {
                for (let j = 100; j > 0; j -= 20) {
                    next_color_list.push(`hsl(${h}, ${j}%, ${i}%)`);
                }
            }
        }
        var tt = "";
        for (let n in next_color_list) {
            tt += `<div class="color_i" style="background-color: ${next_color_list[n]}" title="${color_conversion(
                next_color_list[n],
                取色器默认格式
            )}"></div>`;
        }
        document.querySelector("#draw_color_color").innerHTML = tt;
        document.querySelectorAll("#draw_color_color > div").forEach((el: HTMLElement, index) => {
            el.onmousedown = (event) => {
                if (event.button == 0) {
                    c_color(el);
                } else {
                    // 回到主盘
                    show_color();
                }
            };
        });
        next_color_list = tt = null;
    }
    function show_color() {
        var t = "";
        for (let x of color_list) {
            t += `<div class="color_i" style="background-color: ${x}" title="${color_conversion(
                x,
                取色器默认格式
            )}"></div>`;
        }
        document.querySelector("#draw_color_color").innerHTML = t;
        document.querySelectorAll("#draw_color_color > div").forEach((el: HTMLElement, index) => {
            el.onmousedown = (event) => {
                if (event.button == 0) {
                    c_color(el);
                } else {
                    // 下一层级
                    next_color(color_list[index]);
                }
            };
        });
        t = null;
    }
    // 事件
    function c_color(el) {
        change_color({ [color_m]: el.style.backgroundColor }, true, true);
        if (color_m == "fill") color_alpha_input_1.value = "100";
        if (color_m == "stroke") color_alpha_input_2.value = "100";
    }
}
color_bar();

(<HTMLInputElement>document.querySelector("#draw_stroke_width > range-b")).oninput = () => {
    set_f_object_v(
        null,
        null,
        Number((<HTMLInputElement>document.querySelector("#draw_stroke_width > range-b")).value)
    );
};

/** 鼠标点击后，改变栏文字样式 */
function get_f_object_v() {
    if (fabric_canvas.getActiveObject()) {
        var n = fabric_canvas.getActiveObject();
        if (n._objects) {
            // 当线与形一起选中，确保形不会透明
            for (let i of n._objects) {
                if (i.canChangeFill) n = i;
            }
        }
        if (n.filters) n = { fill: fill_color, stroke: stroke_color, strokeWidth: stroke_width };
    } else if (fabric_canvas.isDrawingMode) {
        n = { fill: "#0000", stroke: free_color, strokeWidth: free_width };
    } else {
        n = { fill: fill_color, stroke: stroke_color, strokeWidth: stroke_width };
    }
    console.log(n);
    var [fill, stroke, strokeWidth] = [n.fill, n.stroke, n.strokeWidth];
    (<HTMLInputElement>document.querySelector("#draw_stroke_width > range-b")).value = strokeWidth;
    change_color({ fill: fill, stroke: stroke }, false, true);
    var fill_a = Color(color_fill_el.innerText).valpha;
    color_alpha_input_1.value = String(Math.round(fill_a * 100));
    var stroke_a = Color(color_stroke_el.innerText).valpha;
    color_alpha_input_2.value = String(Math.round(stroke_a * 100));
}
/**
 * 更改全局或选中形状的颜色
 * @param {String} fill 填充颜色
 * @param {String} stroke 边框颜色
 * @param {Number} strokeWidth 边框宽度
 */
function set_f_object_v(fill: string, stroke: string, strokeWidth: number) {
    if (fabric_canvas.getActiveObject()) {
        console.log(0);
        /* 选中Object */
        var n = fabric_canvas.getActiveObject(); /* 选中多个时，n下有_Object<形状>数组，1个时，n就是形状 */
        n = n._objects || [n];
        for (let i in n) {
            if (fill) {
                // 只改变形的颜色
                if (n[i].canChangeFill) n[i].set("fill", fill);
            }
            if (stroke) n[i].set("stroke", stroke);
            if (strokeWidth) n[i].set("strokeWidth", strokeWidth);
            if (n[i].形状) {
                if (!store.get(`图像编辑.形状属性.${n[i].形状}`))
                    store.set(`图像编辑.形状属性.${n[i].形状}`, { fc: "", sc: "", sw: NaN });
                if (fill) store.set(`图像编辑.形状属性.${n[i].形状}.fc`, fill);
                if (stroke) store.set(`图像编辑.形状属性.${n[i].形状}.sc`, stroke);
                if (strokeWidth) store.set(`图像编辑.形状属性.${n[i].形状}.sw`, strokeWidth);
            }
        }
        fabric_canvas.renderAll();
    } else if (fabric_canvas.isDrawingMode) {
        console.log(1);
        /* 画笔 */
        if (stroke) fabric_canvas.freeDrawingBrush.color = free_color = stroke;
        if (strokeWidth) fabric_canvas.freeDrawingBrush.width = free_width = strokeWidth;
        free_draw_cursor();
        free_shadow();
    } else {
        console.log(2);
        /* 非画笔非选中 */
        if (fill) fill_color = fill;
        if (stroke) stroke_color = free_color = stroke;
        if (strokeWidth) stroke_width = strokeWidth;
    }
}

// 滤镜
fabric_canvas.filterBackend = fabric.initFilterBackend();
var webglBackend;
try {
    webglBackend = new fabric.WebglFilterBackend();
    fabric_canvas.filterBackend = webglBackend;
} catch (e) {
    console.log(e);
}

var new_filter_selecting = false;
function new_filter_select(o, no) {
    var x1 = o.x.toFixed(),
        y1 = o.y.toFixed(),
        x2 = no.x.toFixed(),
        y2 = no.y.toFixed();
    var x = Math.min(x1, x2),
        y = Math.min(y1, y2),
        w = Math.abs(x1 - x2),
        h = Math.abs(y1 - y2);

    var main_ctx = main_canvas.getContext("2d");
    var tmp_canvas = document.createElement("canvas");
    tmp_canvas.width = w;
    tmp_canvas.height = h;
    var gid = main_ctx.getImageData(x, y, w, h); // 裁剪
    tmp_canvas.getContext("2d").putImageData(gid, 0, 0);
    var img = new fabric.Image(tmp_canvas, {
        left: x,
        top: y,
        lockMovementX: true,
        lockMovementY: true,
        lockRotation: true,
        lockScalingX: true,
        lockScalingY: true,
        hasControls: false,
        hoverCursor: "auto",
    });
    fabric_canvas.add(img);
    fabric_canvas.setActiveObject(img);
}

(<HTMLInputElement>(<HTMLInputElement>document.querySelector("#draw_filters_select > lock-b"))).oninput = () => {
    exit_free();
    exit_shape();
    new_filter_selecting = true;
    fabric_canvas.defaultCursor = "crosshair";
    hotkeys.setScope("drawing_esc");
};

function apply_filter(i, filter) {
    var obj = fabric_canvas.getActiveObject();
    obj.filters[i] = filter;
    obj.applyFilters();
    fabric_canvas.renderAll();
}
function get_filters() {
    if (fabric_canvas.getActiveObject()?.filters !== undefined) {
        s_h_filters_div(false);
    } else {
        s_h_filters_div(true);
        return;
    }
    var f = fabric_canvas.getActiveObject().filters;
    console.log(f);
    (<HTMLInputElement>document.querySelector("#draw_filters_pixelate > range-b")).value = String(f[0]?.blocksize || 0);
    (<HTMLInputElement>document.querySelector("#draw_filters_blur > range-b")).value = String(f[1]?.blur * 100 || 0);
    (<HTMLInputElement>document.querySelector("#draw_filters_brightness > range-b")).value = String(
        f[2]?.brightness || 0
    );
    (<HTMLInputElement>document.querySelector("#draw_filters_contrast > range-b")).value = String(f[3]?.contrast || 0);
    (<HTMLInputElement>document.querySelector("#draw_filters_saturation > range-b")).value = String(
        f[4]?.saturation || 0
    );
    (<HTMLInputElement>document.querySelector("#draw_filters_hue > range-b")).value = String(f[5]?.rotation || 0);
    (<HTMLInputElement>document.querySelector("#draw_filters_gamma > range-b:nth-child(1)")).value = String(
        f[6]?.gamma[0] || 1
    );
    (<HTMLInputElement>document.querySelector("#draw_filters_gamma > range-b:nth-child(2)")).value = String(
        f[6]?.gamma[1] || 1
    );
    (<HTMLInputElement>document.querySelector("#draw_filters_gamma > range-b:nth-child(3)")).value = String(
        f[6]?.gamma[2] || 1
    );
    (<HTMLInputElement>document.querySelector("#draw_filters_noise > range-b")).value = String(f[7]?.noise || 0);
    var gray = f[8]?.mode;
    switch (gray) {
        case "average":
            (<HTMLInputElement>document.querySelector("#draw_filters_grayscale > lock-b:nth-child(1)")).checked = true;
            break;
        case "lightness":
            (<HTMLInputElement>document.querySelector("#draw_filters_grayscale > lock-b:nth-child(2)")).checked = true;
            break;
        case "luminosity":
            (<HTMLInputElement>document.querySelector("#draw_filters_grayscale > lock-b:nth-child(3)")).checked = true;
        default:
            (<HTMLInputElement>document.querySelector("#draw_filters_grayscale > lock-b:nth-child(1)")).checked = false;
            (<HTMLInputElement>document.querySelector("#draw_filters_grayscale > lock-b:nth-child(2)")).checked = false;
            (<HTMLInputElement>document.querySelector("#draw_filters_grayscale > lock-b:nth-child(3)")).checked = false;
    }
    (<HTMLInputElement>document.querySelector("#draw_filters_invert > lock-b")).checked = f[9] ? true : false;
    (<HTMLInputElement>document.querySelector("#draw_filters_sepia > lock-b")).checked = f[10] ? true : false;
    (<HTMLInputElement>document.querySelector("#draw_filters_bw > lock-b")).checked = f[11] ? true : false;
    (<HTMLInputElement>document.querySelector("#draw_filters_brownie > lock-b")).checked = f[12] ? true : false;
    (<HTMLInputElement>document.querySelector("#draw_filters_vintage > lock-b")).checked = f[13] ? true : false;
    (<HTMLInputElement>document.querySelector("#draw_filters_koda > lock-b")).checked = f[14] ? true : false;
    (<HTMLInputElement>document.querySelector("#draw_filters_techni > lock-b")).checked = f[15] ? true : false;
    (<HTMLInputElement>document.querySelector("#draw_filters_polaroid > lock-b")).checked = f[16] ? true : false;
}
function s_h_filters_div(v) {
    var l = document.querySelectorAll("#draw_filters_i > div") as NodeListOf<HTMLDivElement>;
    if (v) {
        for (let i = 1; i < l.length; i++) {
            l[i].style.pointerEvents = "none";
            l[i].style.opacity = "0.2";
        }
    } else {
        for (let i = 1; i < l.length; i++) {
            l[i].style.pointerEvents = "auto";
            l[i].style.opacity = "1";
        }
    }
}
s_h_filters_div(true);

// 马赛克
// 在fabric源码第二个uBlocksize * uStepW改为uBlocksize * uStepH
(<HTMLInputElement>document.querySelector("#draw_filters_pixelate > range-b")).oninput = () => {
    var value = Number((<HTMLInputElement>document.querySelector("#draw_filters_pixelate > range-b")).value);
    if (value != 0) {
        var filter = new fabric.Image.filters.Pixelate({
            blocksize: value,
        });
        apply_filter(0, filter);
    } else {
        apply_filter(0, null);
    }
};
// 模糊
(<HTMLInputElement>document.querySelector("#draw_filters_blur > range-b")).oninput = () => {
    var value = Number((<HTMLInputElement>document.querySelector("#draw_filters_blur > range-b")).value) / 100;
    if (value != 0) {
        var filter = new fabric.Image.filters.Blur({
            blur: value,
        });
        apply_filter(1, filter);
    } else {
        apply_filter(1, null);
    }
};
// 亮度
(<HTMLInputElement>document.querySelector("#draw_filters_brightness > range-b")).oninput = () => {
    var value = (<HTMLInputElement>document.querySelector("#draw_filters_brightness > range-b")).value;
    var filter = new fabric.Image.filters.Brightness({
        brightness: value,
    });
    apply_filter(2, filter);
};
// 对比度
(<HTMLInputElement>document.querySelector("#draw_filters_contrast > range-b")).oninput = () => {
    var value = (<HTMLInputElement>document.querySelector("#draw_filters_contrast > range-b")).value;
    var filter = new fabric.Image.filters.Contrast({
        contrast: value,
    });
    apply_filter(3, filter);
};
// 饱和度
(<HTMLInputElement>document.querySelector("#draw_filters_saturation > range-b")).oninput = () => {
    var value = (<HTMLInputElement>document.querySelector("#draw_filters_saturation > range-b")).value;
    var filter = new fabric.Image.filters.Saturation({
        saturation: value,
    });
    apply_filter(4, filter);
};
// 色调
(<HTMLInputElement>document.querySelector("#draw_filters_hue > range-b")).oninput = () => {
    var value = (<HTMLInputElement>document.querySelector("#draw_filters_hue > range-b")).value;
    var filter = new fabric.Image.filters.HueRotation({
        rotation: value,
    });
    apply_filter(5, filter);
};
// 伽马
(<HTMLInputElement>document.querySelector("#draw_filters_gamma > range-b:nth-child(1)")).oninput =
    (<HTMLInputElement>document.querySelector("#draw_filters_gamma > range-b:nth-child(2)")).oninput =
    (<HTMLInputElement>document.querySelector("#draw_filters_gamma > range-b:nth-child(3)")).oninput =
        () => {
            var r = (<HTMLInputElement>document.querySelector("#draw_filters_gamma > range-b:nth-child(1)")).value;
            var g = (<HTMLInputElement>document.querySelector("#draw_filters_gamma > range-b:nth-child(2)")).value;
            var b = (<HTMLInputElement>document.querySelector("#draw_filters_gamma > range-b:nth-child(3)")).value;
            var filter = new fabric.Image.filters.Gamma({
                gamma: [r, g, b],
            });
            apply_filter(6, filter);
        };
// 噪音
(<HTMLInputElement>document.querySelector("#draw_filters_noise > range-b")).oninput = () => {
    var value = (<HTMLInputElement>document.querySelector("#draw_filters_noise > range-b")).value;
    var filter = new fabric.Image.filters.Noise({
        noise: value,
    });
    apply_filter(7, filter);
};
// 灰度
(<HTMLInputElement>document.querySelector("#draw_filters_grayscale > lock-b:nth-child(1)")).oninput = () => {
    (<HTMLInputElement>document.querySelector("#draw_filters_grayscale > lock-b:nth-child(2)")).checked = false;
    (<HTMLInputElement>document.querySelector("#draw_filters_grayscale > lock-b:nth-child(3)")).checked = false;
    if ((<HTMLInputElement>document.querySelector("#draw_filters_grayscale > lock-b:nth-child(1)")).checked)
        var filter = new fabric.Image.filters.Grayscale({ mode: "average" });
    apply_filter(8, filter);
};
(<HTMLInputElement>document.querySelector("#draw_filters_grayscale > lock-b:nth-child(2)")).oninput = () => {
    (<HTMLInputElement>document.querySelector("#draw_filters_grayscale > lock-b:nth-child(1)")).checked = false;
    (<HTMLInputElement>document.querySelector("#draw_filters_grayscale > lock-b:nth-child(3)")).checked = false;
    if ((<HTMLInputElement>document.querySelector("#draw_filters_grayscale > lock-b:nth-child(2)")).checked)
        var filter = new fabric.Image.filters.Grayscale({ mode: "lightness" });
    apply_filter(8, filter);
};
(<HTMLInputElement>document.querySelector("#draw_filters_grayscale > lock-b:nth-child(3)")).oninput = () => {
    (<HTMLInputElement>document.querySelector("#draw_filters_grayscale > lock-b:nth-child(1)")).checked = false;
    (<HTMLInputElement>document.querySelector("#draw_filters_grayscale > lock-b:nth-child(2)")).checked = false;
    if ((<HTMLInputElement>document.querySelector("#draw_filters_grayscale > lock-b:nth-child(3)")).checked)
        var filter = new fabric.Image.filters.Grayscale({ mode: "luminosity" });
    apply_filter(8, filter);
};
// 负片
(<HTMLInputElement>document.querySelector("#draw_filters_invert > lock-b")).oninput = () => {
    var value = (<HTMLInputElement>document.querySelector("#draw_filters_invert > lock-b")).checked;
    var filter = value ? new fabric.Image.filters.Invert() : null;
    apply_filter(9, filter);
};
// 棕褐色
(<HTMLInputElement>document.querySelector("#draw_filters_sepia > lock-b")).oninput = () => {
    var value = (<HTMLInputElement>document.querySelector("#draw_filters_sepia > lock-b")).checked;
    var filter = value ? new fabric.Image.filters.Sepia() : null;
    apply_filter(10, filter);
};
// 黑白
(<HTMLInputElement>document.querySelector("#draw_filters_bw > lock-b")).oninput = () => {
    var value = (<HTMLInputElement>document.querySelector("#draw_filters_bw > lock-b")).checked;
    var filter = value ? new fabric.Image.filters.BlackWhite() : null;
    apply_filter(11, filter);
};
// 布朗尼
(<HTMLInputElement>document.querySelector("#draw_filters_brownie > lock-b")).oninput = () => {
    var value = (<HTMLInputElement>document.querySelector("#draw_filters_brownie > lock-b")).checked;
    var filter = value ? new fabric.Image.filters.Brownie() : null;
    apply_filter(12, filter);
};
// 老式
(<HTMLInputElement>document.querySelector("#draw_filters_vintage > lock-b")).oninput = () => {
    var value = (<HTMLInputElement>document.querySelector("#draw_filters_vintage > lock-b")).checked;
    var filter = value ? new fabric.Image.filters.Vintage() : null;
    apply_filter(13, filter);
};
// 柯达彩色胶片
(<HTMLInputElement>document.querySelector("#draw_filters_koda > lock-b")).oninput = () => {
    var value = (<HTMLInputElement>document.querySelector("#draw_filters_koda > lock-b")).checked;
    var filter = value ? new fabric.Image.filters.Kodachrome() : null;
    apply_filter(14, filter);
};
// 特艺色彩
(<HTMLInputElement>document.querySelector("#draw_filters_techni > lock-b")).oninput = () => {
    var value = (<HTMLInputElement>document.querySelector("#draw_filters_techni > lock-b")).checked;
    var filter = value ? new fabric.Image.filters.Technicolor() : null;
    apply_filter(15, filter);
};
// 宝丽来
(<HTMLInputElement>document.querySelector("#draw_filters_polaroid > lock-b")).oninput = () => {
    var value = (<HTMLInputElement>document.querySelector("#draw_filters_polaroid > lock-b")).checked;
    var filter = value ? new fabric.Image.filters.Polaroid() : null;
    apply_filter(16, filter);
};

// 确保退出其他需要鼠标事件的东西，以免多个东西一起出现
function exit_free() {
    fabric_canvas.isDrawingMode = false;
    free_i_els[0].checked = false;
    free_i_els[1].checked = false;
    free_i_els[2].checked = false;
    fabric_canvas.defaultCursor = "auto";
}
function exit_shape() {
    shape = "";
    drawing_shape = false;
    fabric_canvas.selection = true;
    fabric_canvas.defaultCursor = "auto";
    poly_o_p = [];
}
function exit_filter() {
    new_filter_selecting = false;
    (<HTMLInputElement>document.querySelector("#draw_filters_select > lock-b")).checked = false;
    fabric_canvas.defaultCursor = "auto";
}
hotkeys("esc", "drawing_esc", () => {
    exit_free();
    exit_shape();
    exit_filter();
    hotkeys.setScope("normal");
});

// fabric命令行
var draw_edit_input_el = <HTMLInputElement>document.querySelector("#draw_edit input");
document.getElementById("draw_edit_b").onclick = () => {
    s_center_bar("edit");
    if (center_bar_show) {
        draw_edit_input_el.focus();
        hotkeys("enter", "c_bar", fabric_api);
        hotkeys("esc", "c_bar", () => {
            s_center_bar("edit");
        });
    }
};
document.getElementById("draw_edit_run").onclick = () => {
    fabric_api();
};
function fabric_api() {
    var e = draw_edit_input_el.value;
    var $0 = fabric_canvas.getActiveObject();
    if (!e.includes("$0")) {
        e = `fabric_canvas.getActiveObject().set({${e}})`;
    }
    var div = document.createElement("div");
    div.innerText = eval(e);
    document.getElementById("draw_edit_output").appendChild(div);
    document.getElementById("draw_edit_output").style.margin = "4px";
    fabric_canvas.renderAll();
}
document.getElementById("draw_edit_clear").onclick = () => {
    document.getElementById("draw_edit_output").innerHTML = "";
    document.getElementById("draw_edit_output").style.margin = "";
};

var fabric_clipboard;
function fabric_copy() {
    var dx = store.get("图像编辑.复制偏移.x"),
        dy = store.get("图像编辑.复制偏移.y");
    fabric_canvas.getActiveObject().clone(function (cloned) {
        fabric_clipboard = cloned;
    });
    fabric_clipboard.clone(function (clonedObj) {
        fabric_canvas.discardActiveObject();
        clonedObj.set({
            left: clonedObj.left + dx,
            top: clonedObj.top + dy,
            evented: true,
        });
        if (clonedObj.type === "activeSelection") {
            clonedObj.fabric_canvas = fabric_canvas;
            clonedObj.forEachObject(function (obj) {
                fabric_canvas.add(obj);
            });
            clonedObj.setCoords();
        } else {
            fabric_canvas.add(clonedObj);
        }
        fabric_canvas.setActiveObject(clonedObj);
        fabric_canvas.requestRenderAll();
    });
    his_push();
}
hotkeys("Ctrl+v", "normal", fabric_copy);
