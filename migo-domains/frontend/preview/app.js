(function(){
"use strict";
var $=function(s,r){return (r||document).querySelector(s);};
var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));};
var TLDS=[{t:".com",p:"12.99"},{t:".net",p:"14.50"},{t:".store",p:"9.90"},{t:".shop",p:"8.75"},{t:".dev",p:"15.00"},{t:".org",p:"13.20"}];
var DOMAINS=[
{d:"migo-example.com",c:"أحمد س.",s:["p-ok","مسجّل"],e:"2027-04-12",r:"14.99$",cost:"9.20",m:"+3.00"},
{d:"nourtech.net",c:"نور ع.",s:["p-info","قيد النقل"],e:"2027-01-30",r:"14.50$",cost:"11.00",m:"+3.00"},
{d:"shop-zahra.store",c:"زهرة م.",s:["p-warn","ينتهي قريبًا"],e:"2026-11-24",r:"9.90$",cost:"7.40",m:"+2.50"},
{d:"deals-house.shop",c:"كريم ر.",s:["p-warn","بانتظار الدفع"],e:"—",r:"—",cost:"6.10",m:"+2.50"},
{d:"old-brand.com",c:"سارة ط.",s:["p-bad","فشل الدفع"],e:"2026-11-10",r:"14.99$",cost:"9.20",m:"+3.00"},
{d:"studio-nine.dev",c:"هاني ب.",s:["p-ok","مسجّل"],e:"2028-02-08",r:"18.00$",cost:"12.00",m:"+4.00"}
];
var ORDERS=[
{id:"MD-10428",d:"migo-example.com",c:"أحمد س.",s:["p-ok","مكتمل"],a:"14.99$",t:"2026-11-02 11:40"},
{id:"MD-10431",d:"deals-house.shop",c:"كريم ر.",s:["p-warn","بانتظار الدفع"],a:"8.60$",t:"2026-11-07 09:12"},
{id:"MD-10432",d:"nourtech.net",c:"نور ع.",s:["p-info","قيد التنفيذ"],a:"18.00$",t:"2026-11-08 10:05"},
{id:"MD-10433",d:"old-brand.com",c:"سارة ط.",s:["p-bad","فاشل"],a:"14.99$",t:"2026-11-08 12:20"},
{id:"MD-10434",d:"studio-nine.dev",c:"هاني ب.",s:["p-acc","جديد"],a:"19.00$",t:"2026-11-08 13:02"},
{id:"MD-10435",d:"old-brand.com",c:"سارة ط.",s:["p-mut","ملغى"],a:"—",t:"2026-11-08 13:30"}
];
var CUSTOMERS=[
{n:"أحمد س.",a:"a***@example.com",d:"3",o:"5",s:["p-ok","نشط"]},
{n:"نور ع.",a:"n***@example.com",d:"1",o:"2",s:["p-ok","نشط"]},
{n:"سارة ط.",a:"s***@example.com",d:"2",o:"4",s:["p-warn","مراجعة"]},
{n:"هاني ب.",a:"h***@example.com",d:"1",o:"1",s:["p-ok","نشط"]}
];
var REV=[
{m:"2026-06",r:"1,820$",c:"1,260$",mg:"560$",a:"3.10$"},
{m:"2026-07",r:"2,140$",c:"1,470$",mg:"670$",a:"3.25$"},
{m:"2026-08",r:"2,480$",c:"1,690$",mg:"790$",a:"3.35$"},
{m:"2026-09",r:"2,720$",c:"1,880$",mg:"840$",a:"3.40$"},
{m:"2026-10",r:"2,910$",c:"2,020$",mg:"890$",a:"3.40$"},
{m:"2026-11",r:"2,410$",c:"1,660$",mg:"750$",a:"3.40$"}
];
var AUDIT=[
{u:"admin@migo",o:"تسجيل دومين",t:"2026-11-08 13:02",i:"studio-nine.dev",r:["p-ok","نجحت"]},
{u:"system",o:"فشل دفع",t:"2026-11-08 12:20",i:"MD-10433",r:["p-bad","فشلت"]},
{u:"support@migo",o:"تعديل بيانات",t:"2026-11-08 11:15",i:"old-brand.com",r:["p-ok","نجحت"]},
{u:"system",o:"تنبيه تجديد",t:"2026-11-08 08:00",i:"shop-zahra.store",r:["p-warn","معلّقة"]},
{u:"admin@migo",o:"تحديث سعر",t:"2026-11-07 17:44",i:"pricing rules",r:["p-ok","نجحت"]}
];
var PRICING=[
{x:".com",cost:"9.20",sell:"12.20",m:"+3.00",tier:"8 إلى أقل من 15$"},
{x:".net",cost:"11.00",sell:"14.00",m:"+3.00",tier:"8 إلى أقل من 15$"},
{x:".store",cost:"7.40",sell:"9.90",m:"+2.50",tier:"أقل من 8$"},
{x:".shop",cost:"6.10",sell:"8.60",m:"+2.50",tier:"أقل من 8$"},
{x:".dev",cost:"12.00",sell:"16.00",m:"+4.00",tier:"15 إلى 30$"},
{x:"premium (44.00)",cost:"44.00",sell:"50.60",m:"+6.60",tier:"أكثر من 30$ · 15%"}
];
var SCREENS=[
{t:"نتائج البحث",u:"/search",rows:[["migo-example.com","متاح","12.99$"],["migo-example.net","متاح","14.50$"],["migo-example.store","محجوز","—"]],note:"نتائج موسومة كـ Demo"},
{t:"تفاصيل الدومين",u:"/domain/:id",rows:[["الحالة","مسجّل",""],["الانتهاء","2027-04-12",""],["سعر التجديد","14.99$",""]],note:"بيانات الدومين والملكية"},
{t:"السلة",u:"/cart",rows:[["migo-example.com","سنة","14.99$"],["migo-example.net","سنة","18.00$"],["الإجمالي","2 بند","32.99$"]],note:"يمكن تعديل المدة لكل بند"},
{t:"إتمام الدفع",u:"/checkout",rows:[["بيانات Registrant","مكتملة",""],["طريقة الدفع","USD · EGP",""],["الموافقات","مطلوبة",""]],note:"مفيش بوابة دفع متصلة"},
{t:"دوميناتي",u:"/account/domains",rows:[["migo-example.com","مسجّل",""],["shop-zahra.store","ينتهي قريبًا",""],["old-brand.com","فشل الدفع",""]],note:"قايمة كل دوميناتك"},
{t:"إدارة الدومين",u:"/account/domain",rows:[["سجلات DNS","4",""],["Auth Code","عند السماح",""],["قفل النقل","مفعّل",""]],note:"تحكّم كامل في الدومين"},
{t:"التجديد",u:"/account/renew",rows:[["المدة","سنة",""],["سعر التجديد","14.99$",""],["التنبيهات","30 يوم",""]],note:"تجديد بضغطة"},
{t:"الطلبات",u:"/account/orders",rows:[["MD-10428","مكتمل","14.99$"],["MD-10431","بانتظار الدفع","8.60$"],["MD-10433","فاشل","14.99$"]],note:"كل طلباتك وحالاتها"},
{t:"الدعم",u:"/support",rows:[["تذكرة جديدة","متاح",""],["مركز الدعم","12 مقال",""],["وقت الرد","أقل من 24 ساعة",""]],note:"نموذج تصميمي"}
];
var ALT=[{d:"migo.net",p:"14.50"},{d:"migo.store",p:"9.90"},{d:"migo.shop",p:"8.75"},{d:"getmigo.com",p:"12.99"}];
var cart=0;
function pill(s){return '<span class="pill '+s[0]+'">'+s[1]+'</span>';}
function money(v){return '<span class="mono">'+v+'</span>';}
function esc(v){return String(v).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
function rows(tb,data,fn){var b=$(tb);if(!b)return;b.innerHTML=data.map(fn).join("");}
rows("#domBody",DOMAINS,function(r){return "<tr><td class='mono'>"+r.d+"</td><td>"+r.c+"</td><td>"+pill(r.s)+"</td><td class='num'>"+r.e+"</td><td class='num'>"+r.r+"</td><td class='num'>"+r.cost+"</td><td class='num' style='color:var(--ok)'>"+r.m+"</td><td><button class='linklike' type='button' data-toast='تجريبي · تفاصيل "+r.d+"'>تفاصيل</button></td></tr>";});
rows("#ordBody",ORDERS,function(r){return "<tr><td class='mono'>"+r.id+"</td><td class='mono'>"+r.d+"</td><td>"+r.c+"</td><td>"+pill(r.s)+"</td><td class='num'>"+r.a+"</td><td class='num'>"+r.t+"</td></tr>";});
rows("#cusBody",CUSTOMERS,function(r){return "<tr><td>"+r.n+"</td><td class='mono'>"+r.a+"</td><td class='num'>"+r.d+"</td><td class='num'>"+r.o+"</td><td>"+pill(r.s)+"</td></tr>";});
rows("#audBody",AUDIT,function(r){return "<tr><td class='mono'>"+r.u+"</td><td>"+r.o+"</td><td class='num'>"+r.t+"</td><td class='mono'>"+r.i+"</td><td>"+pill(r.r)+"</td></tr>";});
rows("#priBody",PRICING,function(r){return "<tr><td class='mono'>"+r.x+"</td><td class='num'>"+r.cost+"</td><td class='num'>"+r.sell+"</td><td class='num' style='color:var(--ok)'>"+r.m+"</td><td>"+r.tier+"</td></tr>";});
$("#tldStrip").innerHTML=TLDS.map(function(t){return "<span><b>"+t.t+"</b> "+t.p+"$</span>";}).join("");
$("#screensGrid").innerHTML=SCREENS.map(function(s){
return "<div class='mini'><div class='h'><span>"+s.t+"</span><span class='spacer'></span><span class='mono dim' style='font-weight:400'>"+s.u+"</span></div><div class='b'>"+
s.rows.map(function(r){return "<div class='ln'><span class='"+(r[1]==="—"?"dim":"muted")+"'>"+r[0]+"</span><span>"+(r[2]?"<span class='mono'>"+r[2]+"</span>":"<span class='muted'>"+r[1]+"</span>")+"</span></div>";}).join("")+
"<div class='dim' style='font-size:11.5px;margin-top:10px'>Demo · "+s.note+"</div></div></div>";
}).join("");
var sres=$("#sres"), goBtn=$("#goBtn"), q=$("#q"), timer=null;
function name(){var v=(q&&q.value?q.value:"").trim();return (v||"migo").replace(/^https?:\/\//,"").replace(/\s+/g,"-");}
function stateLoading(){
if(goBtn){goBtn.disabled=true;goBtn.setAttribute("aria-busy","true");}
sres.innerHTML="<div class='stack' style='gap:12px'><span class='spin' aria-hidden='true'></span><div><div style='font-weight:700'>جارٍ التحقق من توفّر الدومين…</div><div class='dim' style='font-size:13px'>ثواني بسيطة، بنجهّز النتيجة.</div></div></div>";
timer=setTimeout(function(){stateAvailable();clearTimeout(timer);},1400);
}
function free(){
if(goBtn){goBtn.disabled=false;goBtn.removeAttribute("aria-busy");}
}
function stateAvailable(){
free();
sres.innerHTML="<div><div class='stack'><span class='pill p-ok'>متاح</span><span class='mono' style='font-size:15px'>"+esc(name())+".com</span></div>"+
"<div class='pricegrid'><div class='price'><div class='k'>سعر التسجيل (أول سنة)</div><div class='v'>12.99$</div></div>"+
"<div class='price'><div class='k'>سعر التجديد السنوي</div><div class='v'>14.99$</div></div>"+
"<div class='price'><div class='k'>مدة التسجيل</div><div class='v'>سنة</div></div></div>"+
"<div class='stack' style='margin-top:14px'><button class='btn btn-primary demo-action' type='button' data-add='"+esc(name())+".com'>أضف إلى السلة</button><button class='btn btn-ghost' type='button' data-state='alt'>شوف بدائل</button></div>"+
"<div class='dim' style='font-size:12px;margin-top:10px'>نتيجة تجريبية ثابتة · مش فحص حقيقي</div></div>";
}
function stateTaken(){
free();
sres.innerHTML="<div><div class='stack'><span class='pill p-bad'>محجوز</span><span class='mono' style='font-size:15px'>"+esc(name())+".com</span></div>"+
"<p class='muted' style='font-size:13.5px;margin-top:10px'>الدومين ده مسجّل بالفعل. ممكن يكون معروض للبيع من صاحبه، أو تختار اسم بديل قريب.</p>"+
"<div style='margin-top:12px'>"+ALT.map(function(a){return "<div class='alt'><span class='nm mono'>"+a.d+"</span><span class='pill p-ok'>متاح</span><span class='mono' style='font-size:13px'>"+a.p+"$</span><button class='btn btn-secondary btn-sm' type='button' data-add='"+a.d+"'>أضف</button></div>";}).join("")+"</div>"+
"<div class='dim' style='font-size:12px;margin-top:10px'>بدائل وأسعار تجريبية للعرض فقط</div></div>";
}
function stateError(){
free();
sres.innerHTML="<div class='stack' style='align-items:flex-start;gap:12px'><span class='pill p-bad'>تعذّر التحقق</span><div>"+
"<div style='font-weight:700'>مقدرناش نتأكد من توفّر الدومين دلوقتي</div>"+
"<div class='muted' style='font-size:13.5px;margin-top:4px'>يمكن تكون مشكلة مؤقتة في الشبكة. جرّب تاني بعد لحظات، ولو المشكلة فضلت كلّم الدعم.</div>"+
"<div class='stack' style='margin-top:12px'><button class='btn btn-secondary' id='retryBtn' type='button'>إعادة المحاولة</button></div>"+
"<div class='dim' style='font-size:12px;margin-top:8px'>مفيش أي تفاصيل تقنية حسّاسة معروضة للعميل</div></div></div>";
}
function stateAlt(){
free();
sres.innerHTML="<div><div style='font-weight:700;margin-bottom:6px'>اقتراحات بديلة</div><div class='dim' style='font-size:13px;margin-bottom:10px'>اختار أكتر من دومين وأضفهم للسلة مرة واحدة.</div>"+
ALT.map(function(a,i){return "<div class='alt'><label class='check' style='flex:1;min-width:150px'><input type='checkbox' class='sr' "+(i<2?"checked":"")+"><span class='box'></span><span class='nm mono' style='font-size:13.5px'>"+a.d+"</span></label><span class='pill p-ok'>متاح</span><span class='mono' style='font-size:13px'>"+a.p+"$</span></div>";}).join("")+
"<div class='stack' style='margin-top:14px'><button class='btn btn-primary demo-action' type='button' data-add='2 دوين (مختارين)'>أضف المختار للسلة</button></div>"+
"<div class='dim' style='font-size:12px;margin-top:10px'>أسعار واقتراحات تجريبية</div></div>";
}
function setState(s){
if(timer){clearTimeout(timer);timer=null;}
free();
if(s==="loading")return stateLoading();
if(s==="available")return stateAvailable();
if(s==="taken")return stateTaken();
if(s==="error")return stateError();
if(s==="alt")return stateAlt();
}
if(goBtn)goBtn.addEventListener("click",function(){setState("loading");});
if(q)q.addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();setState("loading");}});
$$("[data-state]").forEach(function(b){b.addEventListener("click",function(){setState(b.getAttribute("data-state"));});});
document.addEventListener("click",function(e){
var b=e.target.closest?e.target.closest("[data-add]"):null;
if(b){
cart++;var c=$("#cartCount");if(c)c.textContent="السلة "+cart;
toast("أُضيف إلى سلة تجريبية · الإجمالي "+cart+" بند","ok");
}
if(e.target.closest&&e.target.closest("#retryBtn"))setState("loading");
var chip=e.target.closest?e.target.closest(".fchip:not([data-state])"):null;
if(chip)chip.parentNode.querySelectorAll(".fchip").forEach(function(x){x.setAttribute("aria-pressed",x===chip?"true":"false");});
var sw=e.target.closest?e.target.closest(".switch"):null;
if(sw)sw.setAttribute("aria-checked",sw.getAttribute("aria-checked")==="true"?"false":"true");
});
if(q&&sres)setState("available");
$$("[data-tabs]").forEach(function(bar){
bar.addEventListener("click",function(e){
var t=e.target.closest(".tab");if(!t)return;
$$(".tab",bar).forEach(function(x){x.setAttribute("aria-selected",x===t?"true":"false");});
var group=bar.getAttribute("data-tabs");
var panels=bar.parentNode?$$("[role='tabpanel']",bar.parentNode):[];
panels.forEach(function(p){p.hidden=(p.getAttribute("aria-labelledby")!=="tab-"+t.getAttribute("data-tab"));});
if(!panels.length)$$(".panel").forEach(function(p){if(p.getAttribute("aria-labelledby"))p.hidden=(p.getAttribute("aria-labelledby")!=="tab-"+t.getAttribute("data-tab"));});
});
});
$$(".sb .item").forEach(function(it){
it.addEventListener("click",function(){
var sec=it.getAttribute("data-asec");
$$(".sb .item").forEach(function(x){if(x===it)x.setAttribute("aria-current","true");else x.removeAttribute("aria-current");});
$$("[data-apanel]").forEach(function(p){p.hidden=p.getAttribute("data-apanel")!==sec;});
if(window.matchMedia("(max-width:1099px)").matches){$("#sb").classList.remove("open");$("#drawerBtn").setAttribute("aria-expanded","false");}
});
});
var drawerBtn=$("#drawerBtn");
if(drawerBtn)drawerBtn.addEventListener("click",function(){
var open=$("#sb").classList.toggle("open");
drawerBtn.setAttribute("aria-expanded",open?"true":"false");
});
var mBtn=$("#mBtn"),mNav=$("#mNav");
if(mBtn)mBtn.addEventListener("click",function(){
var open=mNav.classList.toggle("open");
mBtn.setAttribute("aria-expanded",open?"true":"false");
});
if(mNav)mNav.addEventListener("click",function(e){if(e.target.tagName==="A"){mNav.classList.remove("open");mBtn.setAttribute("aria-expanded","false");}});
var lastFocus=null;
function openDlg(id){
var d=document.getElementById(id);if(!d)return;
lastFocus=document.activeElement;d.classList.add("open");
var f=d.querySelector("button,input,[href]");if(f)f.focus();
}
function closeDlg(){
$$(".overlay.open").forEach(function(d){d.classList.remove("open");});
if(lastFocus&&lastFocus.focus)lastFocus.focus();
}
document.addEventListener("click",function(e){
var o=e.target.closest?e.target.closest("[data-dialog]"):null;
if(o){openDlg(o.getAttribute("data-dialog"));return;}
if(e.target.closest&&e.target.closest("[data-close]")){closeDlg();return;}
if(e.target.classList&&e.target.classList.contains("overlay"))closeDlg();
});
document.addEventListener("keydown",function(e){
if(e.key==="Escape"){
if($$(".overlay.open").length)closeDlg();
if(mNav&&mNav.classList.contains("open")){mNav.classList.remove("open");mBtn.setAttribute("aria-expanded","false");}
if($("#sb")&&$("#sb").classList.contains("open")){$("#sb").classList.remove("open");drawerBtn.setAttribute("aria-expanded","false");}
}
});
function toast(msg,kind){
var box=$("#toaster");if(!box)return;
var t=document.createElement("div");
t.className="toast"+(kind==="warn"?" warn":kind==="err"?" err":"");
t.setAttribute("role","status");
t.innerHTML="<span aria-hidden='true'>•</span><div>"+esc(msg)+"</div>";
box.appendChild(t);
setTimeout(function(){if(t.parentNode)t.parentNode.removeChild(t);},3200);
}
$$("[data-toast]").forEach(function(b){b.addEventListener("click",function(){toast(b.getAttribute("data-toast"),"ok");});});
var lb=$("#loadBtn");
if(lb)lb.addEventListener("click",function(){
if(lb.getAttribute("aria-busy")==="true")return;
var old=lb.textContent;
lb.setAttribute("aria-busy","true");lb.disabled=true;lb.textContent="جارٍ التنفيذ…";
setTimeout(function(){lb.removeAttribute("aria-busy");lb.disabled=false;lb.textContent=old;toast("خلص التنفيذ (تجريبي)","ok");},1200);
});
var dirBtn=$("#dirBtn");
if(dirBtn)dirBtn.addEventListener("click",function(){
var en=document.documentElement.getAttribute("dir")==="ltr";
document.documentElement.setAttribute("dir",en?"rtl":"ltr");
document.documentElement.setAttribute("lang",en?"ar":"en");
dirBtn.setAttribute("aria-pressed",en?"false":"true");
dirBtn.textContent=en?"EN / LTR":"AR / RTL";
toast(en?"تم الرجوع للعربية (RTL)":"Switched to English (LTR)","ok");
});
var rb=$("#resetBtn");
if(rb)rb.addEventListener("click",function(){
cart=0;var c=$("#cartCount");if(c)c.textContent="السلة 0";
if(q)q.value="migo";
setState("available");
$$(".fchip[aria-pressed]").forEach(function(x,i){x.setAttribute("aria-pressed",i===0?"true":"false");});
toast("تم إرجاع الحالات التجريبية","ok");
});
if($("#heroGo"))$("#heroGo").addEventListener("click",function(){
var v=$("#heroQ").value.trim();
if(!v){toast("اكتب اسم الدومين الأول","warn");return;}
if(q)q.value=v;setState("loading");
var y=$("#search").getBoundingClientRect().top+window.pageYOffset-60;
window.scrollTo({top:y,behavior:"smooth"});
});
})();