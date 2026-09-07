const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const multer = require("multer");
const Database = require("better-sqlite3");
const crypto = require("crypto");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database(path.join(__dirname, "data", "magnus.sqlite"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT UNIQUE,
 role TEXT NOT NULL DEFAULT 'buyer',
 password_hash TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS paintings (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 description TEXT NOT NULL,
 price_paise INTEGER NOT NULL,
 artist TEXT NOT NULL,
 kind TEXT NOT NULL,
 preview_file TEXT,
 original_file TEXT,
 status TEXT NOT NULL DEFAULT 'pending',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 buyer_id INTEGER NOT NULL,
 painting_id INTEGER NOT NULL,
 amount_paise INTEGER NOT NULL,
 fee_paise INTEGER NOT NULL,
 seller_amount_paise INTEGER NOT NULL,
 payment_status TEXT NOT NULL DEFAULT 'pending',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

const upload = multer({ dest: path.join(__dirname, "data/uploads") });
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({limit:"1mb"}));
app.use(express.urlencoded({extended:true}));
app.use(session({
  secret: process.env.SESSION_SECRET || "DEV_ONLY_CHANGE_ME",
  resave:false, saveUninitialized:false,
  cookie:{httpOnly:true,sameSite:"lax",secure:false,maxAge:8*60*60*1000}
}));

function verifyBossPassword(input){
  const stored = process.env.BOSS_PASSWORD_HASH || "";
  const p = stored.split("$");
  if(p.length !== 4 || p[0] !== "pbkdf2_sha256") return false;
  const iterations = Number(p[1]);
  const salt = Buffer.from(p[2],"base64");
  const expected = Buffer.from(p[3],"base64");
  const actual = crypto.pbkdf2Sync(String(input), salt, iterations, expected.length, "sha256");
  return crypto.timingSafeEqual(actual, expected);
}
function bossOnly(req,res,next){
  if(req.session?.boss) return next();
  return res.status(401).json({error:"Boss authentication required"});
}
function userOnly(req,res,next){
  if(req.session?.userId) return next();
  return res.status(401).json({error:"Login required"});
}

app.post("/api/boss/login",(req,res)=>{
  if(verifyBossPassword(req.body.password)){
    req.session.boss = true;
    return res.json({ok:true});
  }
  res.status(401).json({error:"Invalid boss password"});
});
app.post("/api/boss/logout",(req,res)=>{req.session.boss=false;res.json({ok:true})});
app.get("/api/boss/me",(req,res)=>res.json({boss:!!req.session?.boss}));

app.post("/api/register",(req,res)=>{
  const {name,email,password}=req.body||{};
  if(!name || !email || !password || password.length<8) return res.status(400).json({error:"Name, email and an 8+ character password are required."});
  try{
    const result=db.prepare("INSERT INTO users(name,email,password_hash) VALUES(?,?,?)").run(name,email.toLowerCase(),password);
    req.session.userId=result.lastInsertRowid;
    res.json({ok:true});
  }catch(e){res.status(400).json({error:"Email is already registered."})}
});
app.post("/api/login",(req,res)=>{
  const u=db.prepare("SELECT * FROM users WHERE email=?").get(String(req.body.email||"").toLowerCase());
  // TODO: replace this demo comparison with Argon2id/bcrypt before public launch.
  if(!u || u.password_hash !== req.body.password) return res.status(401).json({error:"Invalid login"});
  req.session.userId=u.id; res.json({ok:true,name:u.name});
});
app.post("/api/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/me",(req,res)=>{
  const u=req.session.userId && db.prepare("SELECT id,name,email,role FROM users WHERE id=?").get(req.session.userId);
  res.json({user:u||null});
});

app.get("/api/paintings",(req,res)=>{
  const rows=db.prepare("SELECT id,title,description,price_paise,artist,kind,preview_file,status,created_at FROM paintings WHERE status='approved' ORDER BY id DESC").all();
  res.json(rows);
});

app.post("/api/boss/paintings",bossOnly,upload.fields([{name:"preview",maxCount:1},{name:"original",maxCount:1}]),(req,res)=>{
  const {title,description,price,artist,kind}=req.body;
  const n=Number(price);
  if(!title||!description||!artist||!kind||!Number.isFinite(n)||n<=0) return res.status(400).json({error:"Invalid painting details"});
  const preview=req.files?.preview?.[0]?.filename||null;
  const original=req.files?.original?.[0]?.filename||null;
  const r=db.prepare(`INSERT INTO paintings(title,description,price_paise,artist,kind,preview_file,original_file,status) VALUES(?,?,?,?,?,?,?,'approved')`)
    .run(title,description,Math.round(n*100),artist,kind,preview,original);
  res.json({ok:true,id:r.lastInsertRowid});
});

app.get("/api/boss/dashboard",bossOnly,(req,res)=>{
  const sales=db.prepare("SELECT COUNT(*) count, COALESCE(SUM(amount_paise),0) gross, COALESCE(SUM(fee_paise),0) fees, COALESCE(SUM(seller_amount_paise),0) seller_total FROM orders WHERE payment_status='paid'").get();
  const users=db.prepare("SELECT COUNT(*) count FROM users").get().count;
  const paintings=db.prepare("SELECT COUNT(*) count FROM paintings").get().count;
  res.json({sales,users,paintings,feePercent:Number(process.env.PLATFORM_FEE_PERCENT||2)});
});

app.post("/api/orders",userOnly,(req,res)=>{
  const painting=db.prepare("SELECT * FROM paintings WHERE id=? AND status='approved'").get(Number(req.body.paintingId));
  if(!painting) return res.status(404).json({error:"Painting not found"});
  const fee=Math.round(painting.price_paise*Number(process.env.PLATFORM_FEE_PERCENT||2)/100);
  const seller=painting.price_paise-fee;
  const r=db.prepare("INSERT INTO orders(buyer_id,painting_id,amount_paise,fee_paise,seller_amount_paise,payment_status) VALUES(?,?,?,?,?,'pending')")
    .run(req.session.userId,painting.id,painting.price_paise,fee,seller);
  // Payment-provider call must be added here before changing status to paid.
  res.json({orderId:r.lastInsertRowid,amount_paise:painting.price_paise,fee_paise:fee,seller_amount_paise:seller,paymentRequired:true});
});

// Secure original delivery: only a paid order for the logged-in buyer may reach this endpoint.
// In production, replace local file response with a short-lived private-storage URL.
app.get("/api/purchases/:orderId/original",userOnly,(req,res)=>{
  const order=db.prepare(`SELECT o.*,p.original_file FROM orders o JOIN paintings p ON p.id=o.painting_id
    WHERE o.id=? AND o.buyer_id=? AND o.payment_status='paid'`).get(Number(req.params.orderId),req.session.userId);
  if(!order || !order.original_file) return res.status(403).json({error:"Purchase not verified or original unavailable"});
  res.status(501).json({error:"Connect private object storage for secure original delivery."});
});

app.use(express.static(path.join(__dirname,"public")));
app.get("/{*splat}",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

app.listen(PORT,()=>console.log(`MAGNUS PAINTINGS running on http://localhost:${PORT}`));
