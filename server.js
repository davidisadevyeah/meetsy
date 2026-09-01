const http=require("http");
const fs=require("fs");
const path=require("path");
const WebSocket=require("ws");

const PORT=process.env.PORT||3000;
const PUBLIC=path.join(__dirname,"public");
const MIME={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css"};

const server=http.createServer((req,res)=>{
  let u=(req.url||"/").split("?")[0];
  if(u==="/")u="/index.html";
  const file=path.normalize(path.join(PUBLIC,u));
  if(!file.startsWith(PUBLIC))return res.writeHead(403).end();
  fs.readFile(file,(err,data)=>{
    if(err)return res.writeHead(404).end("Not found");
    res.writeHead(200,{"Content-Type":MIME[path.extname(file)]||"application/octet-stream","Cache-Control":"no-store"});
    res.end(data);
  });
});

const wss=new WebSocket.Server({server});
const rooms=new Map();

function send(ws,msg){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(msg));}
function others(room,except){return [...(rooms.get(room)||[])].filter(x=>x!==except);}

wss.on("connection",ws=>{
  ws.id=Math.random().toString(36).slice(2)+Date.now().toString(36);
  ws.room=null;ws.name="Guest";

  ws.on("message",raw=>{
    let m;try{m=JSON.parse(raw)}catch{return}

    if(m.type==="join"){
      const room=String(m.room||"").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,80);
      if(!room)return;
      ws.room=room;ws.name=String(m.name||"Guest").slice(0,40);
      if(!rooms.has(room))rooms.set(room,new Set());

      send(ws,{type:"joined",selfId:ws.id,
        peers:others(room,ws).map(p=>({id:p.id,name:p.name}))});

      rooms.get(room).add(ws);
      others(room,ws).forEach(p=>send(p,{type:"peer-joined",peer:{id:ws.id,name:ws.name}}));
    }

    if(m.type==="signal"&&ws.room){
      const target=others(ws.room,ws).find(p=>p.id===m.to);
      if(target)send(target,{type:"signal",from:ws.id,name:ws.name,data:m.data});
    }

    if(m.type==="chat"&&ws.room){
      others(ws.room,null).forEach(p=>send(p,{
        type:"chat",from:ws.id,name:ws.name,
        text:String(m.text||"").slice(0,1000)
      }));
    }
  });

  const leave=()=>{
    if(!ws.room)return;
    const set=rooms.get(ws.room);
    if(set){
      set.delete(ws);
      set.forEach(p=>send(p,{type:"peer-left",id:ws.id}));
      if(!set.size)rooms.delete(ws.room);
    }
    ws.room=null;
  };
  ws.on("close",leave);
  ws.on("error",leave);
});

server.listen(PORT,()=>console.log("Meetsy running on port "+PORT));