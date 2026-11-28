/* Original script block 1:  */
/* Shaka Player CDN fallback loader. Playback waits until a working copy is available. */
window.__sportyShakaPromise = null;
window.ensureSportyShaka = function () {
  if (window.shaka && window.shaka.Player) return Promise.resolve(true);
  if (window.__sportyShakaPromise) return window.__sportyShakaPromise;
  const sources = [
    "https://cdn.jsdelivr.net/npm/shaka-player@4.16.2/dist/shaka-player.compiled.js",
    "https://unpkg.com/shaka-player@4.16.2/dist/shaka-player.compiled.js",
    "https://cdnjs.cloudflare.com/ajax/libs/shaka-player/4.16.2/shaka-player.compiled.js"
  ];
  window.__sportyShakaPromise = new Promise((resolve, reject) => {
    let i = 0;
    function next() {
      if (window.shaka && window.shaka.Player) { resolve(true); return; }
      if (i >= sources.length) {
        window.__sportyShakaPromise = null;
        reject(new Error("ভিডিও প্লেয়ার লাইব্রেরি লোড হয়নি। নেটওয়ার্ক বা CDN ব্লক থাকলে অন্য নেটওয়ার্কে চেষ্টা করুন।"));
        return;
      }
      const script = document.createElement("script");
      script.src = sources[i++];
      script.async = true;
      script.onload = () => (window.shaka && window.shaka.Player) ? resolve(true) : next();
      script.onerror = next;
      document.head.appendChild(script);
    }
    next();
  });
  return window.__sportyShakaPromise;
};


/* Original script block 2:  */
window.__sportyMpegtsPromise=null;
window.ensureSportyMpegts=function(){
 if(window.mpegts&&window.mpegts.createPlayer)return Promise.resolve(true);
 if(window.__sportyMpegtsPromise)return window.__sportyMpegtsPromise;
 const sources=["https://cdn.jsdelivr.net/npm/mpegts.js@1.8.0/dist/mpegts.min.js","https://unpkg.com/mpegts.js@1.8.0/dist/mpegts.min.js"];
 window.__sportyMpegtsPromise=new Promise((resolve,reject)=>{
  let i=0;function next(){
   if(window.mpegts&&window.mpegts.createPlayer){resolve(true);return;}
   if(i>=sources.length){window.__sportyMpegtsPromise=null;reject(new Error("FLV Player library লোড হয়নি।"));return;}
   const script=document.createElement("script");script.src=sources[i++];script.async=true;
   script.onload=()=>window.mpegts&&window.mpegts.createPlayer?resolve(true):next();script.onerror=next;document.head.appendChild(script);
  }next();
 });return window.__sportyMpegtsPromise;
};


/* Original script block 3:  */
const $=id=>document.getElementById(id), video=$("video");
let channels=[],liveSports=[],activeHls=null,activeShaka=null,activeShakaUI=null,activeMpegts=null,activeKey=null,playRequestId=0,qualityMode="",configLoadInProgress=false,selectedMatchFilter="ALL",adaptiveQualityTimer=null;
video.preload="auto";
video.autoplay=true;
video.addEventListener("canplay",()=>{if(video.dataset.currentUrl)video.play().catch(()=>{})});
const defaults={liveSports:[
{name:"Sports 1",category:"SPORTS",logo:"⚽",tone:"blue",url:""},
{name:"Cricket Live",category:"CRICKET",logo:"🏏",tone:"gold",url:""},
{name:"Football Live",category:"FOOTBALL",logo:"⚽",tone:"blue",url:""}],liveTvChannels:[]};
function safeText(s){return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
// Live TV JSON control: show Y/yes shows a channel; N/no hides it. Missing show defaults to visible.
function isChannelShown(ch){
 const value=String(ch.Show ?? ch.show ?? "Y").trim().toLowerCase();
 return !["n","no","false","0","hide","hidden"].includes(value);
}
function isServerShown(stream){
 const value=String(stream?.Show ?? stream?.show ?? "Y").trim().toLowerCase();
 return !["n","no","false","0","hide","hidden"].includes(value);
}
function categoryFor(ch){
 const raw=String(ch.category||"").toLowerCase(),name=String(ch.name||"").toLowerCase();
 if(ch.section==="liveSports")return "Live Sports";
 // Respect an explicit category in channels.json before automatic classification.
 const explicit=String(ch.category||"").trim().toLowerCase();
 if(explicit==="movie"||explicit==="movies")return "Movie";
 if(explicit==="cartoon"||explicit==="cartoons"||explicit==="animation")return "Cartoon";
 if(explicit==="religion"||explicit==="religious"||explicit==="islamic"||explicit==="religious tv")return "Religion";
 if(explicit==="documentary"||explicit==="documentaries"||explicit==="documentary tv")return "Documentary";
 if(/movie|cinema|film/.test(name+" "+raw))return "Movie";
 if(/cartoon|animation|kids|children/.test(name+" "+raw))return "Cartoon";
 if(/religion|religious|islamic|quran|koran|azan|makkah|madinah/.test(name+" "+raw))return "Religion";
 if(/documentary|documentaries|discovery|nat geo|national geographic|animal planet|history tv/.test(name+" "+raw))return "Documentary";
 if(/sport|football|soccer|cricket|mpd|dash/.test(raw)||/\b(gtv|sony ten|star sports)\b/.test(name))return "Sports";
 if(/music/.test(raw+" "+name)||/9xm|b4u music|zoom/.test(name))return "Music";
 if(/news/.test(raw)||/news|dbc|ekhon tv/.test(name))return "News";
 if(/zee|jalsha|sony|colors|star |sun tv|indian/.test(name)||/indian/.test(raw))return "Indian";
 if(/bangla/.test(raw)||/boishakhi|asian tv|deepto|nagorik|ntv|rtv|channel i|atn bangla|bijoy|desh tv|me tv|my tv|nrb tv|rajdhani|srk tv|mohona|green tv|maasranga|bangla vision|channel 16|channel 52|amar bangla/.test(name))return "Bangla";
 return "Entertainment";
}
const categoryInfo={
 "All":{title:"✨ All Channels",order:0},
 "Bangla":{title:"🇧🇩 Bangla TV",order:1},
 "Indian":{title:"🇮🇳 Indian TV",order:2},
 "Music":{title:"🎵 Music",order:3},
 "Sports":{title:"⚽ Sports",order:4},
 "News":{title:"📰 News",order:5},
 "Entertainment":{title:"🎬 Entertainment",order:6},
 "Movie":{title:"🎥 Movie",order:7},
 "Cartoon":{title:"🧸 Cartoon",order:8},
 "Religion":{title:"🕌 Religion",order:9},
 "Documentary":{title:"🎞️ Documentary",order:10}
};
let selectedCategory="Bangla";
function splitMatchTeams(name){
 const parts=String(name).trim().split(/\s+(?:VS?\.?|versus|v)\s+/i).filter(Boolean);
 if(parts.length>=2)return [parts[0].trim(),parts.slice(1).join(" ").trim()];
 return [String(name||"Team").trim(),"Opponent"];
}
// Team logos are loaded from ./data/teams.json. Names and aliases are matched case-insensitively.
let teamLogoMap = Object.create(null);
function normalizeTeamName(value){
 const raw=String(value||"").toLowerCase();
 return raw.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
}
async function loadTeamLogos(){
 teamLogoMap=Object.create(null);
 const repoOwner="Adnanakhim98",repoName="Nova-Tv",branch="main";
 const rawBase=`https://raw.githubusercontent.com/${repoOwner}/${repoName}/${branch}/`;
 const registerTeams=(data,sourceUrl)=>{
  const teams=Array.isArray(data)?data:(Array.isArray(data?.teams)?data.teams:[]);
  teams.forEach(team=>{
   if(!team||!team.name)return;
   // Accept common logo field names used by teams.json.
   const rawLogo=team.logo||team.logoUrl||team.logoURL||team.imageUrl||team.image||team.flag||"";
   if(!rawLogo)return;
   let logo=String(rawLogo).trim();
   try{
    if(/^https?:\/\//i.test(logo)){
     // Absolute logo URLs are used as-is.
    }else if(logo.startsWith("/")){
     logo=rawBase+logo.replace(/^\/+/,"");
    }else if(!logo.startsWith("data:")){
     // Relative logo paths are resolved from the JSON file; root-style paths work too.
     if(/^(?:\.\.\/)*logos\//i.test(logo)) logo=rawBase+logo.replace(/^(?:\.\.\/)+/,"");
     else if(logo.startsWith("./logos/")) logo=rawBase+logo.slice(2);
     else if(sourceUrl) logo=new URL(logo,sourceUrl).href;
    }
   }catch(e){}
   const entry={name:String(team.name),logo};
   const aliases=[team.name,...(Array.isArray(team.aliases)?team.aliases:[]),...(Array.isArray(team.alternativeNames)?team.alternativeNames:[])];
   aliases.forEach(alias=>{
    const key=normalizeTeamName(alias);
    if(key)teamLogoMap[key]=entry;
   });
  });
 };
 // Load a fallback shared list first, if present.
 try{
  const url=rawBase+"data/teams.json";
  const response=await fetch(url,{cache:"default"});
  if(response.ok)registerTeams(await response.json(),url);
  else console.warn("teams.json could not be loaded:",response.status);
 }catch(error){console.info("Optional data/teams.json not found.");}
 // GitHub Pages cannot list folders directly. GitHub's repository tree API lets us
 // discover every JSON file at any depth inside tournament/ automatically.
 try{
  const treeUrl=`https://api.github.com/repos/${repoOwner}/${repoName}/git/trees/${branch}?recursive=1`;
  const response=await fetch(treeUrl,{headers:{Accept:"application/vnd.github+json"},cache:"default"});
  if(!response.ok)throw new Error("GitHub tree API HTTP "+response.status);
  const tree=await response.json();
  const files=(tree.tree||[]).filter(item=>item.type==="blob"&&/^tournament\/.*\.json$/i.test(item.path));
  const batches=[];
  for(let i=0;i<files.length;i+=32)batches.push(files.slice(i,i+32));
  for(const batch of batches){
   await Promise.all(batch.map(async file=>{
    try{
     const url=rawBase+file.path.split("/").map(encodeURIComponent).join("/");
     const res=await fetch(url,{cache:"force-cache"});
     if(res.ok)registerTeams(await res.json(),url);
    }catch(error){console.info("Skipped tournament JSON:",file.path);}
   }));
  }
  console.info(`Loaded team logo aliases from ${files.length} tournament JSON file(s).`);
 }catch(error){
  console.warn("Could not auto-discover tournament JSON files. Trying common locations.",error);
  for(const path of ["tournament/laliga.json","tournament/teams.json","laliga.json"]){
   try{const url=rawBase+path;const res=await fetch(url,{cache:"force-cache"});if(res.ok)registerTeams(await res.json(),url);}catch(e){}
  }
 }
}
function teamFlagCode(team){
 const n=normalizeTeamName(team);
 const codes={zimbabwe:"zw",afghanistan:"af",bangladesh:"bd",india:"in",pakistan:"pk",srilanka:"lk",westindies:"jm",england:"gb",australia:"au",newzealand:"nz",southafrica:"za",ireland:"ie",nepal:"np",netherlands:"nl",scotland:"gb",usa:"us",unitedstates:"us",uae:"ae",oman:"om",namibia:"na",canada:"ca",hongkong:"hk"};
 return codes[n]||null;
}
function findTeamLogo(team){return teamLogoMap[normalizeTeamName(team)]||null;}
function teamInitials(team){return String(team).trim().split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase()||"?"}
function makeChannelCard(ch,root,categoryLabel,isLiveEvent=false){
 const b=document.createElement("button");b.type="button";b.className="channel"+((ch.url&&ch.url===video.dataset.currentUrl)||ch===activeChannelItem?" active":"");
 const logoBox=document.createElement("div");logoBox.className="chlogo "+String(ch.tone||"blue").replace(/[^a-z0-9_-]/gi,"");
 const name=document.createElement("div");name.className="chname";name.textContent=String(ch.name||"Unnamed channel");
 if(isLiveEvent){
  // Country/club names are resolved automatically for known country teams; unknown teams get initials.
  const youtubeMatch=isYouTubeMatch(ch);
  const teams=youtubeMatch
   ? [String(ch.team1||"Team 1").trim(),String(ch.team2||"Team 2").trim()]
   : splitMatchTeams(ch.name||"");
  const explicitLogos=youtubeMatch?[ch.team1Logo,ch.team2Logo]:[null,null];
  logoBox.classList.add("team-logos");logoBox.textContent="";
  teams.forEach((team,index)=>{
   if(index===1){const vs=document.createElement("span");vs.className="team-vs";vs.textContent="VS";logoBox.appendChild(vs)}
   const wrap=document.createElement("div");wrap.className="team-logo";
   const teamEntry=findTeamLogo(team);
   const code=teamFlagCode(team);
   // YouTube match cards prefer the two logo URLs supplied directly in the match JSON.
   const suppliedLogo=String(explicitLogos[index]||"").trim();
   const logoUrl=suppliedLogo || (teamEntry&&teamEntry.logo?teamEntry.logo:(code?`https://flagcdn.com/w80/${code}.png`:""));
   if(logoUrl && /^(https?:\/\/|data:image\/|blob:|\/)/i.test(logoUrl)){
    const img=document.createElement("img");img.src=logoUrl;img.alt=team+" logo";img.loading="lazy";img.referrerPolicy="no-referrer";
    img.onerror=()=>{const f=document.createElement("span");f.className="team-logo-fallback";f.textContent=teamInitials(team);img.replaceWith(f)};
    wrap.appendChild(img);
   }else{
    const f=document.createElement("span");f.className="team-logo-fallback";f.textContent=teamInitials(team);wrap.appendChild(f);
   }
   const label=document.createElement("small");label.textContent=team;wrap.appendChild(label);logoBox.appendChild(wrap);
  });
 }else{
  // Show only the logo explicitly supplied in the JSON. Never inject a default/fallback logo.
  const logoValue=String(ch.logoUrl||ch.logo||"").trim();
  if(logoValue){
   if(/^(https?:\/\/|data:image\/|blob:|\/)/i.test(logoValue)){
    const img=document.createElement("img");
    img.src=logoValue;
    img.alt=String(ch.name||"Channel")+" logo";
    img.loading="lazy";
    img.referrerPolicy="no-referrer";
    img.onerror=()=>{img.remove();};
    logoBox.appendChild(img);
   }else{
    // Preserve intentionally supplied emoji/text logo values.
    logoBox.textContent=logoValue;
   }
  }
 }
 if(isLiveEvent){
  const sourcePath=String(ch.__sourceFile||ch.sourceFile||ch.file||"");
  const fileMatch=sourcePath.match(/match-(\d+)\.json/i);
  const channelNumber=fileMatch?fileMatch[1]:"";

  // Upcoming matches show the start time; once LIVE, hide the start time
  // and keep only the channel indicator on the top row.
  const state=matchStatus(ch);
  const startLabel=document.createElement("div");
  startLabel.className="match-start-label";
  if(state!=="LIVE"){
   const startText=document.createElement("span");
   startText.className="match-start-text";
   startText.textContent=formatMatchStartTime(ch);
   startLabel.appendChild(startText);
  }else{
   startLabel.classList.add("is-live-row");
   // Show a blinking LIVE label in the top-left marked position once play begins.
   const liveTag=document.createElement("span");
   liveTag.className="match-live-top-badge";
   liveTag.innerHTML='<i aria-hidden="true"></i> LIVE';
   startLabel.appendChild(liveTag);
  }
  if(state==="LIVE"&&!channelNumber){startLabel.style.display="none";}
  if(channelNumber){
   const channelGroup=document.createElement("span");channelGroup.className="match-channel-group";
   const lamp=document.createElement("span");lamp.className="match-online-lamp";lamp.setAttribute("aria-label","Online indicator");
   const channelText=document.createElement("span");channelText.className="match-channel-text";channelText.textContent="CH-"+channelNumber;
   channelGroup.append(lamp,channelText);startLabel.appendChild(channelGroup);
   startLabel.title="Channel "+channelNumber;
  }

  const badgeRow=document.createElement("div");badgeRow.className="sports-badge-row";
  const status=document.createElement("span");status.className="sports-status";
  status.textContent=state; if(state==="LIVE"){status.classList.add("is-live");status.style.display="none";} // Hide the lower LIVE pill; the blinking top LIVE badge remains. Upcoming status stays visible.

  if(state==="ENDED")status.classList.add("is-ended");
  const type=document.createElement("span");type.className="sports-type";
  type.textContent=String(ch.matchType||ch.match_type||"SPORTS").trim().toUpperCase();
  if(type.textContent==="FOOTBALL")type.classList.add("is-football");
  badgeRow.append(status,type);

  // Keep the card focused on the two team names/logos; do not repeat the match title.
  b.classList.add("match-card");
  b.append(startLabel,logoBox,badgeRow);

  // Icon-only direct share control. It stays separate from the card's play action.
  const shareControl=document.createElement("span");
  shareControl.className="match-share-icon";
  shareControl.setAttribute("role","button");
  shareControl.setAttribute("tabindex","0");
  shareControl.setAttribute("aria-label","Share match");
  shareControl.setAttribute("title","Share match");
  shareControl.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V3m0 0L7 8m5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const shareMatch=async(event)=>{
   event.preventDefault();
   event.stopPropagation();
   const shareUrl=new URL(location.href);
   const sourcePath=String(ch.__sourceFile||ch.sourceFile||ch.file||"");
   const matchNumber=(sourcePath.match(/match-(\d+)\.json/i)||[])[1];
   shareUrl.search="";
   if(matchNumber)shareUrl.searchParams.set("match","match-"+matchNumber);
   else{
    // Keep compatibility for match files that do not use the numbered naming format.
    shareUrl.searchParams.set("matchPath",sourcePath);
    shareUrl.searchParams.set("matchName",String(ch.name||""));
   }
   shareUrl.hash="";
   const payload={title:String(ch.name||"Live Match")+" | SportyNova",text:"Watch "+String(ch.name||"Live Match")+" live on SportyNova",url:shareUrl.href};
   try{
    if(navigator.share){await navigator.share(payload);}
    else if(navigator.clipboard&&navigator.clipboard.writeText){
     await navigator.clipboard.writeText(shareUrl.href);
     showStatus("Share link","ম্যাচের লিংক কপি হয়েছে");
    }else{
     const field=document.createElement("textarea");field.value=shareUrl.href;field.style.position="fixed";field.style.opacity="0";document.body.appendChild(field);field.select();document.execCommand("copy");field.remove();
     showStatus("Share link","ম্যাচের লিংক কপি হয়েছে");
    }
   }catch(error){
    if(error&&error.name!=="AbortError")showStatus("Share link","লিংক শেয়ার করা যায়নি");
   }
  };
  shareControl.addEventListener("click",shareMatch);
  shareControl.addEventListener("keydown",event=>{
   if(event.key==="Enter"||event.key===" "){shareMatch(event);}
  });
  startLabel.appendChild(shareControl);
 }else{
  const category=document.createElement("div");category.className="chcat";category.textContent=categoryLabel;
  b.append(logoBox,name,category);
 }
 b.addEventListener("click",()=>{
  if(isLiveEvent || ch.url || Array.isArray(ch.streams)) playChannelDefault(ch);
  else openModal(ch.name);
 });
 root.appendChild(b);
}
function formatMatchStartTime(ch){
 const dateValue=ch.matchDate||ch.match_date||ch.gameDate||ch.game_date||ch.date;
 const timeValue=ch.matchTime||ch.match_time||ch.kickoff_time||ch.time;
 const candidates=[
  ch.startTime,ch.start_time,ch.kickoff,ch.kickoffTime,ch.matchDateTime,
  ch.datetime,ch.dateTime,ch.start,ch.matchDateTimeLocal,
  (dateValue&&timeValue)?(String(dateValue).includes("T")?String(dateValue):String(dateValue)+" "+String(timeValue)):null,
  timeValue,dateValue
 ];
 for(const value of candidates){
  if(value===undefined||value===null||String(value).trim()==="")continue;
  const raw=String(value).trim();
  const parsed=Date.parse(raw);
  if(Number.isFinite(parsed)){
   const d=new Date(parsed);
   const datePart=new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",timeZone:"Asia/Dhaka"}).format(d).replace(/\s+/g,"-");
   const timePart=new Intl.DateTimeFormat("en-US",{hour:"2-digit",minute:"2-digit",hour12:true,timeZone:"Asia/Dhaka"}).format(d).replace(/\s+/g," ").toUpperCase();
   return datePart+". "+timePart;
  }
  if(/^\d{1,2}:\d{2}(\s?(am|pm))?$/i.test(raw))return raw.replace(/\s+/g," ").toUpperCase();
 }
 return "Match Start Time: TBA";
}
function matchDateValue(ch){
 const direct=[ch.startTime,ch.start_time,ch.kickoff,ch.kickoffTime,ch.matchDateTime,ch.datetime,ch.dateTime,ch.start,ch.date];
 for(const value of direct){if(value===undefined||value===null||value==="")continue;const parsed=Date.parse(String(value));if(Number.isFinite(parsed))return parsed;}
 const date=ch.matchDate||ch.match_date||ch.date||ch.gameDate||ch.game_date;
 const time=ch.matchTime||ch.match_time||ch.time||ch.kickoff_time||ch.start_time;
 if(date){const parsed=Date.parse(String(date)+(time&&!String(date).includes("T")?" "+String(time):""));if(Number.isFinite(parsed))return parsed;}
 return Number.POSITIVE_INFINITY;
}
function matchStatus(ch,now=Date.now()){
 const start=matchDateValue(ch);
 const endValues=[ch.endTime,ch.end_time,ch.endDateTime,ch.end];
 let end=Number.POSITIVE_INFINITY;
 for(const value of endValues){
  if(value===undefined||value===null||String(value).trim()==="")continue;
  const parsed=Date.parse(String(value));
  if(Number.isFinite(parsed)){end=parsed;break;}
 }
 const declared=String(ch.status||ch.matchStatus||ch.state||"").trim().toLowerCase();
 // Explicit live status wins over an imperfect or stale schedule timestamp.
 if(/^(live|playing|in.?progress|1st half|2nd half|innings|ongoing)$/.test(declared)||/live|playing|in.?progress|1st half|2nd half|innings/.test(declared))return "LIVE";
 if(/ended|finished|complete|full.?time|(^|\s)ft($|\s)|result/.test(declared))return "ENDED";
 // Auto status: a started match stays visible as LIVE until its end time.
 if(Number.isFinite(start)&&now>=start){
  if(Number.isFinite(end)&&now>=end)return "ENDED";
  return "LIVE";
 }
 if(Number.isFinite(end)&&now>=end)return "ENDED";
 return "UPCOMING";
}
function sortLiveMatches(items){
 const now=Date.now();
 const today=new Date(now);today.setHours(0,0,0,0);const tomorrow=today.getTime()+86400000;
 return [...items].sort((a,b)=>{
  const sa=matchStatus(a,now),sb=matchStatus(b,now);
  const rank={LIVE:0,UPCOMING:1,ENDED:2};
  if(rank[sa]!==rank[sb])return rank[sa]-rank[sb];
  const da=matchDateValue(a),db=matchDateValue(b);
  if(sa==="UPCOMING"){
   const ba=da>=today.getTime()&&da<tomorrow?0:1,bb=db>=today.getTime()&&db<tomorrow?0:1;
   if(ba!==bb)return ba-bb;
  }
  return da-db||String(a.name||"").localeCompare(String(b.name||""));
 });
}
function normalizeSearchText(value){
 return String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase().replace(/[^a-z0-9\u0980-\u09ff]+/g," ").trim().replace(/\s+/g," ");
}
function render(list=channels){
 const tabs=$("categoryTabs"),root=$("categorySections"),sportsRoot=$("liveSportsChannels");
 tabs.innerHTML="";root.innerHTML="";sportsRoot.innerHTML="";
 const query=normalizeSearchText($("search").value);
 const now=Date.now();
 const searchableText=ch=>normalizeSearchText([
  ch.name,ch.title,ch.category,ch.section,ch.tournament,ch.league,ch.country,
  ch.matchType,ch.match_type,ch.competition,ch.channelName,ch.channel_name,
  ch.aliases, ch.teams, ch.homeTeam,ch.home_team,ch.awayTeam,ch.away_team,
  ch.team1,ch.team2,ch.url,ch.streamUrl,ch.stream_url,ch.link,
  ...(Array.isArray(ch.streams)?ch.streams.flatMap(x=>[x?.name,x?.url]):[]),
  ...(Array.isArray(ch.servers)?ch.servers.flatMap(x=>[x?.name,x?.url]):[])
 ].flat().filter(Boolean).join(" "));
 const matchesSearch=ch=>!query||searchableText(ch).includes(query);
 // Automatically hide matches as soon as their status/end time marks them ENDED.
 // render() runs every 30 seconds, so the card disappears without a page refresh.
 const availableMatches=sortLiveMatches(liveSports).filter(ch=>matchStatus(ch,now)!=="ENDED");
 const liveCount=availableMatches.filter(ch=>matchStatus(ch,now)==="LIVE").length;
 const upcomingCount=availableMatches.filter(ch=>matchStatus(ch,now)==="UPCOMING").length;
 $("allMatchCount").textContent=availableMatches.length;
 $("liveMatchCount").textContent=liveCount;
 $("upcomingMatchCount").textContent=upcomingCount;
 document.querySelectorAll("[data-match-filter]").forEach(btn=>btn.classList.toggle("active",btn.dataset.matchFilter===selectedMatchFilter));
 const liveEvents=availableMatches.filter(ch=>
  (selectedMatchFilter==="ALL"||matchStatus(ch,now)===selectedMatchFilter) &&
  matchesSearch(ch)
 );
 liveEvents.forEach(ch=>makeChannelCard(ch,sportsRoot,"Live Sports",true));
 $("liveSportsCount").textContent=liveEvents.length+" MATCHES";
 const filtered=list.filter(matchesSearch);
 const counts={All:filtered.length};filtered.forEach(ch=>{const cat=categoryFor(ch);counts[cat]=(counts[cat]||0)+1});
 Object.keys(categoryInfo).sort((a,b)=>categoryInfo[a].order-categoryInfo[b].order).forEach(cat=>{
  const tab=document.createElement("button");tab.type="button";tab.className="category-tab"+(selectedCategory===cat?" active":"");
  tab.setAttribute("role","tab");tab.setAttribute("aria-selected",selectedCategory===cat?"true":"false");
  tab.textContent=categoryInfo[cat].title+(counts[cat]!==undefined?" · "+counts[cat]:"");
  tab.addEventListener("click",()=>{selectedCategory=cat;render(channels)});tabs.appendChild(tab);
 });
 $("channelCount").textContent=filtered.length+" CHANNELS";
 const searching=!!query;
 const items=searching?filtered:(selectedCategory==="All"?filtered:filtered.filter(ch=>categoryFor(ch)===selectedCategory));
 const head=document.createElement("div");head.className="sectionhead";
 const h=document.createElement("h2");h.textContent=searching?"🔎 Search Results":categoryInfo[selectedCategory].title;
 const tools=document.createElement("div");tools.className="channel-section-tools";const pill=document.createElement("span");pill.className="online-pill";pill.id="onlinePill";pill.innerHTML='<span class="online-dot"></span> ONLINE: 0/'+channels.filter(ch=>selectedCategory==="All"||categoryFor(ch)===selectedCategory).length;const adminBtn=document.createElement("button");adminBtn.type="button";adminBtn.className="admin-open-btn";adminBtn.textContent="🔐 ADMIN";adminBtn.addEventListener("click",openAdminPanel);tools.append(pill,adminBtn);head.append(h,tools);root.appendChild(head);
 const row=document.createElement("div");row.className="channelrow"+(!searching&&selectedCategory==="Sports"?" sportsrow":"");
 if(!items.length){const empty=document.createElement("div");empty.className="hint";empty.textContent=searching?"এই নামে কোনো চ্যানেল পাওয়া যায়নি।":"এই ক্যাটাগরিতে কোনো চ্যানেল পাওয়া যায়নি।";root.appendChild(empty)}
 items.forEach(ch=>makeChannelCard(ch,row,searching?categoryFor(ch):categoryInfo[selectedCategory].title.replace(/^[^ ]+\s/,""),false));
 if(items.length)root.appendChild(row);
}
function hideQualitySelector(){
 const sel=$("qualitySelect");sel.style.display="none";sel.innerHTML='<option value="auto">Auto</option>';qualityMode="";
}
function showQualityOptions(options,mode){
 const sel=$("qualitySelect");
 const previous=sel.value;
 sel.innerHTML="";
 const auto=document.createElement("option");
 auto.value="auto";
 auto.textContent="Auto (Adaptive)";
 sel.appendChild(auto);
 options.forEach((item,i)=>{
  const opt=document.createElement("option");
  opt.value=String(item.value??i);
  opt.textContent=item.label;
  sel.appendChild(opt);
 });
 sel.style.display=options.length?"inline-block":"none";
 qualityMode=options.length?mode:"";
 // Show the actual active rendition instead of falsely showing Auto.
 let activeValue="";
 if(mode==="hls"&&activeHls&&activeHls.currentLevel>=0){
  activeValue=String(activeHls.currentLevel);
 }
 if(mode==="shaka"&&activeShaka){
  const track=activeShaka.getVariantTracks().find(t=>t.active);
  if(track)activeValue=String(track.id);
 }
 if(activeValue&&Array.from(sel.options).some(o=>o.value===activeValue)){
  sel.value=activeValue;
 }else if(previous&&Array.from(sel.options).some(o=>o.value===previous)){
  sel.value=previous;
 }else{
  sel.value="auto";
 }
}
$("qualitySelect").addEventListener("change",()=>{
 const value=$("qualitySelect").value;
 try{
  if(qualityMode==="shaka"&&activeShaka){
   if(value==="auto"){activeShaka.configure({abr:{enabled:true}})}
   else{const track=activeShaka.getVariantTracks().find(t=>String(t.id)===String(value));if(track){activeShaka.configure({abr:{enabled:false}});activeShaka.selectVariantTrack(track,true)}}
  }
 }catch(e){console.warn("Quality switch failed",e)}
});
function setupHlsQualities(){
 if(!activeHls)return;
 const levels=activeHls.levels||[];
 showQualityOptions(levels.map((l,i)=>({value:i,label:(l.height?l.height+"p":Math.round((l.bitrate||0)/1000)+" kbps")})).sort((a,b)=>Number(b.label.replace(/[^0-9]/g,""))-Number(a.label.replace(/[^0-9]/g,""))),"hls");
}
function setupShakaQualities(){
 if(!activeShaka)return;
 try{
  const tracks=activeShaka.getVariantTracks().filter(t=>t.height && t.type!=="audio");
  // One option per resolution; visibly mark the currently active rendition.
  const byHeight=new Map();
  tracks.forEach(t=>{
   const height=Number(t.height);
   if(!height)return;
   const current=byHeight.get(height);
   if(!current || Number(t.bandwidth||0)>Number(current.bandwidth||0))byHeight.set(height,t);
  });
  const active=tracks.find(t=>t.active);
  const options=[...byHeight.entries()].sort((a,b)=>b[0]-a[0])
   .map(([height,t])=>({value:String(t.id),label:height+"p"+(active&&Number(active.height)===height?" ✓ চলছে":"")}));
  showQualityOptions(options,"shaka");
  if(active){
   const sel=$("qualitySelect");
   if(Array.from(sel.options).some(o=>o.value===String(active.id)))sel.value=String(active.id);
   else{
    const sameHeight=[...byHeight.values()].find(t=>Number(t.height)===Number(active.height));
    if(sameHeight)sel.value=String(sameHeight.id);
   }
  }
 }catch(e){
  console.warn("Could not read DASH quality tracks",e);
  hideQualitySelector();
 }
}
let lastStreamRequest=null;
function setPlayerLoading(show,title="ভিডিও চালু হচ্ছে…",message="Please wait while the stream connects.",error=false){
 const panel=$("playerLoading");
 if(!panel)return;
 $("loadingTitle").textContent=title;
 $("loadingMessage").textContent=message;
 const retry=$("retryBtn");
 if(retry)retry.style.display=error?"inline-flex":"none";
 panel.classList.toggle("show",!!show);
 panel.style.display=show?"flex":"none";
}
function setLiveBadge(on){const badge=$("playerLiveBadge");if(badge)badge.style.display=on?"block":"none";}
async function stopEngines(){
  const playerScreen=$("playerScreen");
  if(window.__novaYTLiveTimer){clearInterval(window.__novaYTLiveTimer);window.__novaYTLiveTimer=null;}
  if(window.__novaYTUiTimer){clearInterval(window.__novaYTUiTimer);window.__novaYTUiTimer=null;}
  if(window.__novaYTControlsHideTimer){clearTimeout(window.__novaYTControlsHideTimer);window.__novaYTControlsHideTimer=null;}
  if(window.__novaYTControlsShowHandler&&playerScreen){
   playerScreen.removeEventListener('pointermove',window.__novaYTControlsShowHandler);
   playerScreen.removeEventListener('pointerdown',window.__novaYTControlsShowHandler);
   playerScreen.removeEventListener('touchstart',window.__novaYTControlsShowHandler);
   playerScreen.removeEventListener('click',window.__novaYTControlsShowHandler);
   window.__novaYTControlsShowHandler=null;
  }
  if(window.__novaYTPlayer){
   try{window.__novaYTPlayer.destroy?.();}catch(e){}
   window.__novaYTPlayer=null;
  }
  if(playerScreen){
   playerScreen.querySelectorAll("iframe.youtube-live-frame,.youtube-embed-toolbar,.youtube-click-shield").forEach(node=>node.remove());
   playerScreen.classList.remove("youtube-embed-mode");
  }
  if(adaptiveQualityTimer){clearTimeout(adaptiveQualityTimer);adaptiveQualityTimer=null;}
  if(activeHls){const old=activeHls;activeHls=null;try{old.destroy()}catch(e){}}
  if(activeShaka){const old=activeShaka;activeShaka=null;try{await old.destroy()}catch(e){}}
  if(activeMpegts){const old=activeMpegts;activeMpegts=null;try{old.pause();old.unload();old.detachMediaElement();old.destroy()}catch(e){console.warn("mpegts cleanup:",e)}}
  video.style.display="";
  video.pause();
  video.onloadedmetadata=null;
  video.onerror=null;
  video.onplaying=null;
  video.removeAttribute("src");
  video.load();
  delete video.dataset.currentUrl;
  activeKey=null;
}
function syncChannelTitleOverlay(){
 const title=$("nowTitle")?.textContent?.trim();
 const overlay=$("channelTitleOverlay");
 if(overlay)overlay.textContent=title || "SPORTYNOVA LIVE TV";
}
if($("nowTitle")){
 const titleObserver=new MutationObserver(syncChannelTitleOverlay);
 titleObserver.observe($("nowTitle"),{childList:true,characterData:true,subtree:true});
}
syncChannelTitleOverlay();
function showStatus(title,meta){$("nowTitle").textContent=title;syncChannelTitleOverlay();$("nowMeta").textContent=meta;if(/playing/i.test(meta)){setLiveBadge(true);setPlayerLoading(false)}else{setLiveBadge(false);/* Never cover the video surface or inline server controls with an error overlay. */setPlayerLoading(false);}}
function parseStreamInput(raw, drmFromJson=null){
 const text=String(raw||"").trim();
 // Only the pipe-delimited suffix is player metadata. Preserve signed/query URLs intact.
 const pipe=text.indexOf("|");
 const manifest=(pipe>=0?text.slice(0,pipe):text).trim();
 const params=new URLSearchParams(pipe>=0?text.slice(pipe+1).replace(/^\?/ ,""):"");
 let embedded=new URLSearchParams();
 try{embedded=new URLSearchParams(new URL(manifest,location.href).search)}catch(e){}
 return {
  url:manifest,
  scheme:(params.get("drmScheme")||embedded.get("drmScheme")||drmFromJson?.scheme||"").toLowerCase(),
  license:params.get("drmLicense")||embedded.get("drmLicense")||drmFromJson?.license||""
 };
}
function streamKind(url){
 const raw=String(url||"").split("|")[0].trim(),candidates=[raw];
 try{const outer=new URL(raw,location.href);for(const key of ["url","src","source","target","file"]){const v=outer.searchParams.get(key);if(v)candidates.push(v)}}catch(e){}
 for(const candidate of candidates){
  let path="",query="";
  try{const u=new URL(candidate,location.href);path=u.pathname.toLowerCase();query=(u.search+" "+u.hash).toLowerCase()}
  catch(e){const clean=String(candidate).split("#")[0];path=clean.split("?")[0].toLowerCase();query=clean.slice(path.length).toLowerCase()}
  if(/\.flv$/.test(path)||/\.flv(?:\?|&|$)/i.test(query))return "flv";
  if(/\.mpd$/.test(path)||/manifest(?:\.mpd)?/.test(path)&&/dash|mpd/.test(query))return "mpd";
  if(/\.m3u8?$/.test(path)||/m3u8/.test(query))return "hls";
  if(/\.(mp4|m4v|webm|ogv|mov|mkv|mp3|m4a|aac|wav|ogg)$/.test(path))return "direct";
  if(/\.(ts|m2ts)$/.test(path))return "transport";
 }
 return "unknown";
}
const sportsServerRow=$("sportsServerRow"),serverGroupHome=$("serverGroupHome");
let serverPopupTimer=null;
function hideSportsServers(){
 if(serverPopupTimer){clearTimeout(serverPopupTimer);serverPopupTimer=null;}
 playerCard.classList.remove("servers-visible");
}
function showSportsServers(){
 if(!playerCard.classList.contains("sports-player-mode"))return;
 // Reveal the server buttons briefly; every tap restarts the four-second timer.
 playerCard.classList.add("servers-visible");
 if(serverPopupTimer)clearTimeout(serverPopupTimer);
 serverPopupTimer=setTimeout(()=>{
   serverPopupTimer=null;
   playerCard.classList.remove("servers-visible");
 },4000);
}
// A tap on the video/player reveals the server strip for four seconds.
$("playerScreen").addEventListener("pointerdown",e=>{
 if(!playerCard.classList.contains("sports-player-mode"))return;
 if(e.target.closest(".sports-server-row")){
   showSportsServers();
   return;
 }
 showSportsServers();
},{passive:true});
// Tapping a server starts playback and restarts the four-second auto-hide timer.
sportsServerRow.addEventListener("click",(e)=>{showSportsServers(); if(e.target.closest(".inline-server-btn")){e.stopPropagation();}});
function setPlayerMode(sportsMode){
 if(!sportsMode)hideSportsServers();
 playerCard.classList.toggle("sports-player-mode",!!sportsMode);
 const group=$("inlineServerGroup");
 if(!group)return;
 if(sportsMode){sportsServerRow.appendChild(group);}
 else {
  const titleOverlay=$("channelTitleOverlay");
  if(titleOverlay&&titleOverlay.parentElement){titleOverlay.insertAdjacentElement("afterend",group);}
  else if(serverGroupHome&&serverGroupHome.parentElement){serverGroupHome.parentElement.insertBefore(group,serverGroupHome.nextSibling);}
 }
}
window.playStream=playStream;
async function playStream(rawUrl,name="Live TV",category="LIVE TV",drm=null,fallbackUrl=""){
 const requestId=++playRequestId;
 const parsed=parseStreamInput(rawUrl,drm),url=parsed.url,kind=streamKind(url);
 const sportsMode=/live\s*sports|sports/i.test(String(category||"")) || !!(currentServerChannel&&isSportsChannel(currentServerChannel));
 if(!/^https?:\/\//i.test(url)){alert("সঠিক http:// অথবা https:// URL দিন।");return}
 lastStreamRequest={rawUrl,name,category,drm,fallbackUrl};
 await stopEngines();
 if(requestId!==playRequestId)return;
 setPlayerMode(sportsMode);
 if(sportsMode)showSportsServers();
 if(requestId!==playRequestId)return;
 $("empty").style.display="none";
 setLiveBadge(false);
 hideQualitySelector();
 // Do not cover the video with a loading overlay; start the stream immediately.
 setPlayerLoading(false);
 video.dataset.currentUrl=rawUrl;
 if(currentServerChannel)setInlineServers(currentServerChannel);
 video.crossOrigin="anonymous";
 video.preload="auto";
 video.autoplay=true;
 video.controls=false;
 // Restore audible playback when switching from a muted stream/player state.
 if(url.includes("/YuppTV/ZeeTVHDAPAC.m3u8")){video.muted=false;video.volume=1;}

 let engine="native", settled=false, timer=null;
 const report=(msg)=>{if(requestId===playRequestId)showStatus(name,msg)};
 const clearStartupTimer=()=>{if(timer){clearTimeout(timer);timer=null}};
 const fail=(reason)=>{
   if(requestId!==playRequestId||settled)return;
   settled=true;clearStartupTimer();
   console.warn("SPORTYNOVA playback error:",reason||"unknown");
   // Live Sports: if playback has not started, automatically try the next
   // available server after the 9-second startup window. Stop after each
   // server has been tried once to prevent an endless switching loop.
   if(sportsMode && currentServerChannel && isSportsChannel(currentServerChannel)){
     const streams=getChannelStreams(currentServerChannel);
     const currentUrl=String(rawUrl||"").trim();
     const currentIndex=streams.findIndex(item=>String(item.url||"").trim()===currentUrl);
     const attempts=Number(window.__sportsAutoSwitchCount||0);
     if(streams.length>1 && attempts<streams.length-1){
       const nextIndex=currentIndex<0?0:(currentIndex+1)%streams.length;
       if(String(streams[nextIndex]?.url||"").trim()!==currentUrl){
         window.__sportsAutoSwitchCount=attempts+1;
         showStatus(name,"ভিডিও চালু হয়নি · পরের সার্ভারে স্বয়ংক্রিয়ভাবে চেষ্টা করা হচ্ছে…");
         playSelectedServer(nextIndex+1);
         return;
       }
     }
   }
   const backupList=String(fallbackUrl||"").split("||").map(s=>s.trim()).filter(Boolean);
   const backup=(!sportsMode?backupList.find(candidate=>candidate!==String(parsed.url||"").trim()):"");
   if(backup){
     showStatus(name,"এই সার্ভার কাজ করছে না · পরের সার্ভারে স্বয়ংক্রিয়ভাবে চেষ্টা করা হচ্ছে…");
     const remaining=backupList.filter(candidate=>candidate!==backup).join("||");
     playStream(backup,name,category,drm,remaining);
     return;
   }
   // Keep the player surface and inline Server 1 / Server 2 controls visible on failure.
   // Do not cover the player with the blocking error overlay; the user can switch servers directly.
   setLiveBadge(false);
   setPlayerLoading(false);
   $("nowTitle").textContent=name;
   syncChannelTitleOverlay();
   $("nowMeta").textContent="Stream চালু হয়নি · প্লেয়ারের Server 1 / Server 2 বাটন চাপুন";
   setInlineServers(currentServerChannel || {name:name,url:rawUrl,category:category});
 };
 const success=(label)=>{
   if(requestId!==playRequestId||settled)return;
   if(video.paused||video.readyState<2)return;
   settled=true;clearStartupTimer();
   if(sportsMode)window.__sportsAutoSwitchCount=0;
   report(label+" · Playing");
 };
 video.onerror=()=>fail("media error");
 video.onplaying=()=>{
   if(url.includes("/YuppTV/ZeeTVHDAPAC.m3u8")){
     video.muted=false;
     console.info("SPORTYNOVA Zee TV media state",{muted:video.muted,volume:video.volume,audioTracks:video.audioTracks?.length||0,readyState:video.readyState});
   }
   success(engine);
   // Keep the selected rendition stable after startup; do not re-enable ABR automatically.
 };
 // A single startup deadline reports a real failure; it does not start another player.
 // DASH/DRM manifests can take longer than a simple HLS playlist. Keep the
 // loading state alive long enough for legitimate slower connections to start.
 const startupLimit=kind==="mpd"?18000:(sportsMode?12000:(kind==="hls"?16000:12000));
 timer=setTimeout(()=>fail("startup timeout after "+Math.round(startupLimit/1000)+" seconds"),startupLimit);

 try{
   if(kind==="flv"){
    await window.ensureSportyMpegts();
    if(requestId!==playRequestId)return;
    if(!window.mpegts||!mpegts.createPlayer)throw new Error("FLV Player library পাওয়া যায়নি।");
    if(!mpegts.isSupported())throw new Error("এই browser-এ FLV/MSE playback সমর্থিত নয়। Chrome আপডেট করুন।");
    engine="mpegts.js (HTTP-FLV)";
    const flvPlayer=mpegts.createPlayer(
      {type:"flv",isLive:true,url:url},
      {enableWorker:true,enableStashBuffer:true,stashInitialSize:128,lazyLoad:false,
       liveBufferLatencyChasing:true,liveBufferLatencyMaxLatency:1.5,liveBufferLatencyMinRemain:0.5}
    );
    activeMpegts=flvPlayer;
    flvPlayer.on(mpegts.Events.ERROR,(type,detail)=>{if(requestId===playRequestId)fail("FLV "+String(type||"error")+" "+String(detail||""))});
    flvPlayer.attachMediaElement(video);flvPlayer.load();
    try{flvPlayer.play()}catch(e){}
    video.play().catch(()=>{});hideQualitySelector();
  }else{
    // Existing Shaka engine continues to handle HLS/M3U8 and MPEG-DASH/MPD.
    if(kind==="direct"||kind==="transport")throw new Error("এই প্লেয়ারে HLS/M3U8, MPEG-DASH/MPD অথবা FLV লিংক দিন।");
    if(kind!=="hls"&&kind!=="mpd"&&kind!=="unknown")throw new Error("সমর্থিত স্ট্রিম হলো HLS/M3U8, MPEG-DASH/MPD ও FLV।");
    if(!window.shaka || !shaka.Player) await window.ensureSportyShaka();
   if(!window.shaka || !shaka.Player) throw new Error("ভিডিও প্লেয়ার লাইব্রেরি পাওয়া যায়নি।");
   shaka.polyfill.installAll();
   if(!shaka.Player.isBrowserSupported()) throw new Error("এই ব্রাউজারে HLS/DASH প্লেব্যাক সমর্থিত নয়। Chrome আপডেট করে চেষ্টা করুন।");
   engine="Shaka ("+(kind==="mpd"?"MPEG-DASH":"HLS")+")";
   activeShaka=new shaka.Player(video);
   const player=activeShaka;
   // Start at a stable SD/medium rendition for faster startup. Keep adaptive
   // bitrate disabled unless the user explicitly chooses Auto, avoiding frequent quality jumps.
   player.configure({
     streaming:{bufferingGoal:8,rebufferingGoal:2,bufferBehind:20,retryParameters:{maxAttempts:3,baseDelay:250,backoffFactor:1.4,timeout:10000}},
     abr:{enabled:false,defaultBandwidthEstimate:700000,bandwidthUpgradeTarget:0.95,bandwidthDowngradeTarget:0.85,switchInterval:30},
     manifest:{retryParameters:{maxAttempts:3,baseDelay:250,backoffFactor:1.4,timeout:10000}}
   });
   // Optional ClearKey support from the existing JSON URL format: |drmScheme=clearkey&drmLicense=KID:KEY
   if(parsed.scheme==="clearkey"&&parsed.license){
     const pair=parsed.license.split(":");
     if(pair.length>=2){
       const cleanHex=v=>String(v||"").replace(/[^0-9a-f]/gi,"").toLowerCase();
       const kid=cleanHex(pair[0]),key=cleanHex(pair.slice(1).join(":"));
       if(kid&&key)player.configure({drm:{clearKeys:{[kid]:key}}});
     }
   }
   player.addEventListener("error",event=>{
     if(requestId!==playRequestId)return;
     const detail=event.detail||{};
     console.warn("SPORTYNOVA Shaka error",detail.code,detail);
     if(detail.severity===shaka.util.Error.Severity.CRITICAL)fail("Shaka error "+(detail.code||"playback"));
   });
   player.addEventListener("adaptation",()=>{if(requestId===playRequestId)setupShakaQualities()});
   player.addEventListener("variantchanged",()=>{if(requestId===playRequestId)setupShakaQualities()});
   await player.load(url);
   if(requestId!==playRequestId)return;
   // Live Sports should begin at the current live edge, never at the event's VOD start.
   try{
     if(player.isLive && player.isLive()){
       const liveRange=player.seekRange();
       if(liveRange && Number.isFinite(liveRange.end) && liveRange.end>0){
         const liveTarget=Math.max(Number(liveRange.start)||0,liveRange.end-1.5);
         video.currentTime=liveTarget;
       }
     }
   }catch(liveEdgeError){console.warn("Could not force live-edge start:",liveEdgeError)}
   // Prefer a low/medium rendition up to 640p (e.g. 480p/540p/640p);
   // if unavailable, start with the lowest available video rendition instead.
   const variants=player.getVariantTracks().filter(t=>t.height && t.type!=="audio");
   if(variants.length){
     const sdVariants=variants.filter(t=>Number(t.height)<=640);
     const startTrack=(sdVariants.length?sdVariants:variants).sort((a,b)=>{
       const heightDiff=Number(b.height||0)-Number(a.height||0);
       return heightDiff || Number(a.bandwidth||0)-Number(b.bandwidth||0);
     })[0];
     if(startTrack){
       player.configure({abr:{enabled:false}});
       player.selectVariantTrack(startTrack,true);
     }
   }
   setupShakaQualities();
   video.play().catch(()=>{});
 }
 }catch(err){fail(err?.message||"player exception")}
 render();
}
let activeChannelItem=null,currentServerChannel=null,currentChannelStreams=[];
function isSportsChannel(ch){return !!ch && (ch.section==="liveSports" || /live sports|sports/i.test(String(ch.category||"")));}
function getChannelStreams(ch){
 let streams=Array.isArray(ch.streams)?ch.streams.filter(stream=>stream&&isServerShown(stream)&&String(stream.url||stream.src||"").trim()):[];
 // Keep every visible, usable stream from the match JSON; do not limit to four.
 // Legacy server fields remain supported when there is no streams array.
 if(!streams.length && !Array.isArray(ch.streams)){
  const maxLegacy=isSportsChannel(ch)?50:2;
  for(let i=1;i<=maxLegacy;i++){
   const url=ch["server"+i]||ch["server"+i+"Url"]||ch["server"+i+"URL"]||(i===1?ch.url:"")||"";
   const legacy={name:ch["server"+i+"Name"]||("Server "+i),url,drm:ch["drm"+i]||ch.drm||null,show:ch["server"+i+"Show"]||"yes"};
   if(isServerShown(legacy)&&String(url).trim())streams.push(legacy);
  }
 }
 return streams.map((stream,i)=>({...stream,name:String(stream.name||("Server "+(i+1))),url:String(stream.url||stream.src||"").trim()}));
}
function setInlineServers(ch){
 currentServerChannel=ch;currentChannelStreams=getChannelStreams(ch);
 const group=$("inlineServerGroup");
 if(!group)return;
 group.replaceChildren();
 if(!currentChannelStreams.length){
  const empty=document.createElement("span");empty.className="server-empty-label";empty.textContent="No servers";group.appendChild(empty);return;
 }
 currentChannelStreams.forEach((stream,index)=>{
  const b=document.createElement("button");b.type="button";b.className="nova-control-btn inline-server-btn";
  b.textContent=stream.name||("Server "+(index+1));
  b.title=stream.name||("Server "+(index+1));
  b.setAttribute("aria-label","Play "+b.textContent);
  b.classList.toggle("active",String(video.dataset.currentUrl||"").trim()===stream.url);
  b.addEventListener("click",()=>{window.__sportsAutoSwitchCount=0;playSelectedServer(index+1)});
  group.appendChild(b);
 });
}
function isYouTubeMatch(ch){
 const kind=String(ch?.type||ch?.playerType||"").toLowerCase();
 const url=String(ch?.url||ch?.streamUrl||"");
 return kind==="youtube" || /(?:youtube\.com\/(?:embed\/|live\/|watch\?v=)|youtu\.be\/)/i.test(url);
}
let __novaYouTubeApiPromise=null;
function loadNovaYouTubeAPI(){
 if(window.YT&&window.YT.Player)return Promise.resolve(window.YT);
 if(!__novaYouTubeApiPromise){
  __novaYouTubeApiPromise=new Promise((resolve,reject)=>{
   const existing=document.querySelector('script[data-nova-youtube-api]');
   const previous=window.onYouTubeIframeAPIReady;
   window.onYouTubeIframeAPIReady=function(){try{if(typeof previous==='function')previous();}catch(e){} resolve(window.YT);};
   if(!existing){const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.async=true;script.dataset.novaYoutubeApi='1';script.onerror=reject;document.head.appendChild(script);}
   else if(window.YT&&window.YT.Player)resolve(window.YT);
   setTimeout(()=>reject(new Error('YouTube API load timeout')),12000);
  });
 }
 return __novaYouTubeApiPromise;
}
function seekNovaYouTubeToLive(player){
 try{
  const duration=Number(player.getDuration&&player.getDuration());
  if(Number.isFinite(duration)&&duration>0){
   const current=Number(player.getCurrentTime&&player.getCurrentTime());
   if(!Number.isFinite(current)||duration-current>8)player.seekTo(Math.max(0,duration-2),true);
  }
 }catch(e){console.warn('YouTube live-edge seek failed',e);}
}
async function playYouTubeMatch(ch){
 activeChannelItem=ch;
 window.__sportsAutoSwitchCount=0;
 if(window.__novaYTLiveTimer){clearInterval(window.__novaYTLiveTimer);window.__novaYTLiveTimer=null;}
 try{if(window.__novaYTPlayer&&window.__novaYTPlayer.destroy)window.__novaYTPlayer.destroy();}catch(e){}
 window.__novaYTPlayer=null;
 playRequestId++;
 await stopEngines();
 setPlayerMode(true);
 hideSportsServers();
 setPlayerLoading(false);
 hideQualitySelector();
 const screen=$("playerScreen");
 const frame=document.createElement("iframe");
 const raw=String(ch.url||"").trim();
 let embed=raw;
 try{
  const u=new URL(raw,location.href);
  if(/youtube\.com\/live\//i.test(u.href)){const id=u.pathname.split("/").filter(Boolean).pop();embed="https://www.youtube.com/embed/"+encodeURIComponent(id);}
  else if(/youtube\.com\/watch/i.test(u.href)){const id=u.searchParams.get("v");if(id)embed="https://www.youtube.com/embed/"+encodeURIComponent(id);}
  else if(/youtu\.be\//i.test(u.href)){const id=u.pathname.split("/").filter(Boolean)[0];if(id)embed="https://www.youtube.com/embed/"+encodeURIComponent(id);}
  else if(/(?:^|\/)embed\//i.test(u.pathname)){
   const id=u.pathname.split("/").filter(Boolean).pop();
   if(id)embed="https://www.youtube.com/embed/"+encodeURIComponent(id);
  }
  const eu=new URL(embed);
  eu.searchParams.set("autoplay","1");eu.searchParams.set("playsinline","1");eu.searchParams.set("rel","0");eu.searchParams.set("modestbranding","1");eu.searchParams.set("iv_load_policy","3");eu.searchParams.set("controls","0");eu.searchParams.set("disablekb","1");eu.searchParams.set("fs","0");eu.searchParams.set("mute","1");eu.searchParams.set("enablejsapi","1");eu.searchParams.set("origin",location.origin);
  embed=eu.href;
 }catch(error){}
 frame.className="youtube-live-frame";
 frame.id="novaYouTubeLiveFrame";
 frame.title=String(ch.name||"YouTube Live");
 frame.src=embed;
 frame.allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
 frame.allowFullscreen=true;
 frame.referrerPolicy="strict-origin-when-cross-origin";
 screen.classList.add("youtube-embed-mode");
 const toolbar=document.createElement("div");toolbar.className="youtube-embed-toolbar";
 const label=document.createElement("span");label.className="youtube-embed-label";label.textContent="SPORTYNOVA LIVE";
 const back=document.createElement("button");back.type="button";back.textContent="−10";back.title="পেছনে ১০ সেকেন্ড";
 const play=document.createElement("button");play.type="button";play.textContent="Ⅱ";play.title="Play / Pause";
 const forward=document.createElement("button");forward.type="button";forward.textContent="+10";forward.title="সামনে ১০ সেকেন্ড";
 const live=document.createElement("button");live.type="button";live.className="youtube-live-btn";live.textContent="● LIVE";live.title="বর্তমান লাইভে যান";
 const time=document.createElement("span");time.className="youtube-embed-time";time.textContent="LIVE";
 const seek=document.createElement("input");seek.type="range";seek.min="0";seek.max="1000";seek.value="1000";seek.step="1";seek.setAttribute("aria-label","ভিডিও seek");
 const orient=document.createElement("button");orient.type="button";orient.className="youtube-orient-btn";orient.textContent="⛶";orient.setAttribute("aria-label","Fullscreen / portrait toggle");orient.title="Fullscreen";
 orient.addEventListener("click",togglePlayerOrientation);
 // Hide the YouTube-only control bar after 4 seconds without interaction.
 const showYTControls=()=>{
  toolbar.classList.remove("is-auto-hidden");
  if(window.__novaYTControlsHideTimer)clearTimeout(window.__novaYTControlsHideTimer);
  window.__novaYTControlsHideTimer=setTimeout(()=>{
   if(toolbar.isConnected)toolbar.classList.add("is-auto-hidden");
   window.__novaYTControlsHideTimer=null;
  },4000);
 };
 if(window.__novaYTControlsShowHandler){
  screen.removeEventListener('pointermove',window.__novaYTControlsShowHandler);
  screen.removeEventListener('pointerdown',window.__novaYTControlsShowHandler);
  screen.removeEventListener('touchstart',window.__novaYTControlsShowHandler);
  screen.removeEventListener('click',window.__novaYTControlsShowHandler);
 }
 window.__novaYTControlsShowHandler=showYTControls;
 screen.addEventListener('pointermove',showYTControls,{passive:true});
 screen.addEventListener('pointerdown',showYTControls,{passive:true});
 screen.addEventListener('touchstart',showYTControls,{passive:true});
 screen.addEventListener('click',showYTControls);
 const ytCall=(fn)=>{const p=window.__novaYTPlayer;if(p&&typeof p[fn]==="function")return p;return null;};
 play.addEventListener("click",()=>{const p=ytCall("getPlayerState");if(!p)return;try{if(p.getPlayerState()===1){p.pauseVideo();play.textContent="▶";}else{p.playVideo();play.textContent="Ⅱ";}}catch(e){}});
 back.addEventListener("click",()=>{const p=ytCall("seekTo");if(p)try{p.seekTo(Math.max(0,p.getCurrentTime()-10),true);}catch(e){}});
 forward.addEventListener("click",()=>{const p=ytCall("seekTo");if(p)try{p.seekTo(Math.min(p.getDuration()-1,p.getCurrentTime()+10),true);}catch(e){}});
 live.addEventListener("click",()=>{const p=ytCall("seekTo");if(p)try{const d=p.getDuration();if(d>0)p.seekTo(Math.max(0,d-1),true);p.playVideo();}catch(e){}});
 seek.addEventListener("input",()=>{const p=ytCall("seekTo");if(p)try{const d=p.getDuration();if(d>0)p.seekTo(d*(Number(seek.value)/1000),true);}catch(e){}});
 toolbar.append(label,back,play,forward,live,seek,time,orient);
 screen.append(frame,toolbar);
 showYTControls();
 // Keep the YouTube iframe non-interactive so clicks on video text/logo cannot navigate away. SportyNova overlay controls use the IFrame API.
 loadNovaYouTubeAPI().then(YT=>{
  if(!screen.isConnected||!screen.contains(frame))return;
  window.__novaYTPlayer=new YT.Player(frame,{events:{onReady:event=>{
   try{event.target.mute();event.target.playVideo();setTimeout(()=>{try{event.target.unMute();event.target.setVolume(100);}catch(e){}},1200);}catch(e){}
   seekNovaYouTubeToLive(event.target);
   if(window.__novaYTLiveTimer)clearInterval(window.__novaYTLiveTimer);
   let attempts=0;
   window.__novaYTLiveTimer=setInterval(()=>{
    if(!screen.isConnected||!screen.contains(frame)||attempts++>=8){clearInterval(window.__novaYTLiveTimer);window.__novaYTLiveTimer=null;return;}
    seekNovaYouTubeToLive(event.target);
   },1500);
   if(window.__novaYTUiTimer)clearInterval(window.__novaYTUiTimer);
   window.__novaYTUiTimer=setInterval(()=>{
    if(!screen.isConnected||!screen.contains(frame)){clearInterval(window.__novaYTUiTimer);window.__novaYTUiTimer=null;return;}
    try{
     const d=event.target.getDuration(),c=event.target.getCurrentTime();
     if(d>0&&!seek.matches(":active"))seek.value=String(Math.max(0,Math.min(1000,Math.round(c/d*1000))));
     time.textContent=d>0?`${Math.floor(c/60)}:${String(Math.floor(c%60)).padStart(2,"0")}`:"LIVE";
     play.textContent=event.target.getPlayerState()===1?"Ⅱ":"▶";
    }catch(e){}
   },500);
  },onStateChange:event=>{if(event.data===1)seekNovaYouTubeToLive(event.target);},onError:event=>{
   const messages={2:"YouTube URL বা ভিডিও ID সঠিক নয়।",5:"এই ডিভাইসে YouTube HTML5 playback সমস্যা হয়েছে।",100:"YouTube ভিডিওটি পাওয়া যায়নি বা Private।",101:"ভিডিও মালিক Embed অনুমতি দেননি।",150:"ভিডিও মালিক Embed অনুমতি দেননি।",153:"YouTube player request-এ browser পরিচয় পাওয়া যায়নি।"};
   const message=messages[event.data]||("YouTube Player error: "+event.data);
   console.error(message,event.data);
   showStatus(ch.name||"YouTube Live",message);
  }}});
 }).catch(error=>{console.warn('YouTube IFrame API unavailable:',error);showStatus(ch.name||"YouTube Live","YouTube API লোড হয়নি। ভিডিওতে ট্যাপ করে চালু করুন।")});
 $("video").style.display="none";
 $("empty").style.display="none";
 currentServerChannel=ch;
 currentChannelStreams=[];
 $("inlineServerGroup").replaceChildren();
 showStatus(ch.name||"YouTube Live","YouTube Live Player · Embed");
 setLiveBadge(true);
}
function playChannelDefault(ch){
 if(isYouTubeMatch(ch)){playYouTubeMatch(ch);return;}
 activeChannelItem=ch;
 window.__sportsAutoSwitchCount=0;
 $("empty").style.display="none";
 setPlayerLoading(false);
 setInlineServers(ch);
 const first=currentChannelStreams.find(stream=>String(stream.url||"").trim())||{};
 const url=String(first.url||ch.url||"").trim();
 const fallback=currentChannelStreams.filter(stream=>stream.url&&stream.url!==url).map(stream=>stream.url).join("||");
 if(!url){showStatus(ch.name||"Live TV","এই ম্যাচে চালু করার মতো কোনো stream URL নেই");return;}
 showStatus(ch.name||"Live TV",(first.name||"Server 1")+" · Connecting…");
 playStream(url,ch.name||"Live TV",(ch.category||"LIVE TV")+" · "+(first.name||"Server 1"),first.drm||ch.drm||null,fallback);
}
function stepChannel(delta){
 const playable=[...channels,...liveSports].filter(ch=>
  ch && isChannelShown(ch) && (isYouTubeMatch(ch) || String(ch.url||"").trim() || (Array.isArray(ch.streams)&&ch.streams.some(s=>s&&String(s.url||s.src||"").trim())))
 );
 if(!playable.length)return;
 let index=playable.indexOf(activeChannelItem);
 if(index<0 && activeChannelItem){
  const key=normalizeSearchText(activeChannelItem.name);
  index=playable.findIndex(ch=>normalizeSearchText(ch.name)===key);
 }
 if(index<0)index=delta>0?-1:0;
 const next=(index+delta+playable.length)%playable.length;
 playChannelDefault(playable[next]);
}
function playSelectedServer(index){
 if(!currentServerChannel)return;
 const stream=currentChannelStreams[index-1]||{},url=String(stream.url||"").trim();
 if(!url)return;
 const fallback=String(currentChannelStreams.find((item,i)=>i!==index-1&&item.url)?.url||"").trim();
 showStatus(currentServerChannel.name||"Live TV",(stream.name||("Server "+index))+" · Connecting…");
 playStream(url,currentServerChannel.name||"Live TV",(currentServerChannel.category||"LIVE TV")+" · "+(stream.name||("Server "+index)),stream.drm||currentServerChannel.drm||null,fallback);
}
// Keep player utility icons fixed while the server strip can be swiped horizontally.
const serverStrip=$("inlineServerGroup");
if(serverStrip){
 serverStrip.addEventListener("wheel",e=>{if(serverStrip.scrollWidth>serverStrip.clientWidth){e.preventDefault();serverStrip.scrollLeft+=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;}},{passive:false});
 serverStrip.addEventListener("keydown",e=>{if(e.key==="ArrowRight"){serverStrip.scrollBy({left:100,behavior:"smooth"});e.preventDefault()}else if(e.key==="ArrowLeft"){serverStrip.scrollBy({left:-100,behavior:"smooth"});e.preventDefault()}});
}
// Fix: the URL button and channels without a stream both call openModal(),
// but the function was missing, so clicking did nothing.
function openModal(channelName=""){
 const modal=$("urlModal");
 if(!modal) return;
 const nameField=$("streamName");
 const urlField=$("streamUrl");
 if(nameField && channelName) nameField.value=channelName;
 modal.classList.add("open");
 if(urlField) setTimeout(()=>urlField.focus(),80);
}
$("customBtn").addEventListener("click",()=>openModal());

$("stopBtn").onclick=async()=>{playRequestId++;await stopEngines();setPlayerMode(false);$("empty").style.display="flex";setLiveBadge(false);setPlayerLoading(false);delete video.dataset.currentUrl;lastStreamRequest=null;hideQualitySelector();showStatus("একটি চ্যানেল নির্বাচন করুন","প্লেব্যাক বন্ধ করা হয়েছে");render();};
$("retryBtn").onclick=()=>{if(lastStreamRequest)playStream(lastStreamRequest.rawUrl,lastStreamRequest.name,lastStreamRequest.category,lastStreamRequest.drm,lastStreamRequest.fallbackUrl||"");};
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>b.closest(".modal").classList.remove("open"));
$("urlModal").addEventListener("click",e=>{if(e.target===$("urlModal"))$("urlModal").classList.remove("open")});
document.addEventListener("keydown",e=>{if(e.key==="Escape")document.querySelectorAll(".modal.open").forEach(m=>m.classList.remove("open"))});
$("playCustom").onclick=()=>{const url=$("streamUrl").value.trim(),name=$("streamName").value.trim()||"Custom Live";if(!url){alert("Stream URL দিন");return}$("urlModal").classList.remove("open");playStream(url,name,"CUSTOM STREAM");};
document.querySelectorAll("[data-match-filter]").forEach(btn=>btn.addEventListener("click",()=>{selectedMatchFilter=btn.dataset.matchFilter||"ALL";render(channels)}));
$("search").addEventListener("input",()=>render(channels));
// Admin API must point to the separately deployed Cloudflare Worker; never put the admin password in this HTML.
const ADMIN_API_BASE = ""; // Set to your admin/status Worker URL, e.g. https://your-admin-worker.workers.dev
let adminPasswordInMemory="", adminRows=[];
let onlineStatusMap={};
function adminApiReady(){return /^https:\/\//i.test(ADMIN_API_BASE)}
async function adminApi(path,options={}){
 if(!adminApiReady())throw new Error("Admin API সেটআপ করা হয়নি। README-তে Worker deploy-এর ধাপ দেখুন।");
 const headers={...(options.headers||{})};
 if(adminPasswordInMemory)headers["X-Admin-Password"]=adminPasswordInMemory;
 if(options.body)headers["Content-Type"]="application/json";
 const r=await fetch(ADMIN_API_BASE.replace(/\/$/,"")+path,{...options,headers,cache:"no-store"});
 const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||("HTTP "+r.status));return data;
}
function channelAdminId(ch){return String(ch.id||ch.channelId||String(ch.name||"channel").trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""));}
function allAdminRows(){return channels.map(ch=>({id:channelAdminId(ch),name:String(ch.name||"Unnamed"),url:String(ch.url||ch.streamUrl||""),category:categoryFor(ch),hidden:!isChannelShown(ch)}))}
function updateOnlinePill(){
 const cat=selectedCategory;const group=channels.filter(ch=>categoryFor(ch)===cat);let on=0;
 group.forEach(ch=>{const row=adminRows.find(x=>x.name===ch.name)||ch;const st=onlineStatusMap[row.id]||onlineStatusMap[ch.name];if(st&&st.status==="online")on++;});
 const pill=document.getElementById("onlinePill");if(pill)pill.innerHTML='<span class="online-dot"></span> ONLINE: '+on+'/'+group.length;
}
async function refreshPublicStatus(){
 try{const d=await adminApi("/status");onlineStatusMap=d.statuses||{};}catch(e){console.warn("Status API unavailable:",e.message)}
 updateOnlinePill();
}
function openAdminPanel(){const m=$("adminModal");m.classList.add("open");m.setAttribute("aria-hidden","false");$("adminLoginView").hidden=false;$("adminDashboard").hidden=true;$("adminLoginMessage").textContent=adminApiReady()?"":"API সেটআপ বাকি: README অনুযায়ী Worker deploy করুন।";$("adminPassword").value="";}
function closeAdminPanel(){ $("adminModal").classList.remove("open");$("adminModal").setAttribute("aria-hidden","true"); }
async function adminLogin(){
 const pw=$("adminPassword").value;if(!pw){$("adminLoginMessage").textContent="পাসওয়ার্ড দিন।";return}
 adminPasswordInMemory=pw;$("adminLoginMessage").textContent="যাচাই করা হচ্ছে…";
 try{await adminApi("/admin/list");$("adminLoginView").hidden=true;$("adminDashboard").hidden=false;await loadAdminDashboard();}
 catch(e){adminPasswordInMemory="";$("adminLoginMessage").textContent=e.message;}
}
async function loadAdminDashboard(){
 $("adminMessage").textContent="স্ট্যাটাস লোড হচ্ছে…";
 try{const d=await adminApi("/admin/list");adminRows=Array.isArray(d.channels)?d.channels:[];onlineStatusMap=d.statuses||{};renderAdminRows();updateOnlinePill();$("adminMessage").textContent="স্ট্যাটাস Worker-এর সর্বশেষ পরীক্ষার ফল। স্বয়ংক্রিয় পরীক্ষা প্রতি ৫ মিনিটে চলে।";}
 catch(e){$("adminMessage").textContent=e.message;}
}
function renderAdminRows(){
 const q=$("adminSearch").value.trim().toLowerCase(),root=$("adminChannelList");root.innerHTML="";
 const rows=adminRows.filter(x=>(x.name+" "+x.category).toLowerCase().includes(q));
 const values=rows.map(x=>({row:x,status:onlineStatusMap[x.id]||onlineStatusMap[x.name]||{status:"unknown"}}));
 $("adminTotal").textContent=adminRows.length;$("adminOnline").textContent=adminRows.filter(x=>(onlineStatusMap[x.id]||onlineStatusMap[x.name]||{}).status==="online").length;$("adminOffline").textContent=adminRows.filter(x=>(onlineStatusMap[x.id]||onlineStatusMap[x.name]||{}).status!=="online").length;
 if(!values.length){root.innerHTML='<p class="hint">কোনো চ্যানেল পাওয়া যায়নি।</p>';return}
 values.forEach(({row,status})=>{const item=document.createElement("div");item.className="admin-channel-item";const info=document.createElement("div");const name=document.createElement("div");name.className="admin-channel-name";name.textContent=row.name+(row.hidden?" (Hidden)":"");const st=document.createElement("div");st.className="admin-channel-state "+(status.status==="online"?"online":status.status==="offline"?"offline":"");st.textContent=(status.status||"unknown").toUpperCase()+(status.checkedAt?" · "+new Date(status.checkedAt).toLocaleString():"");info.append(name,st);const actions=document.createElement("div");actions.className="admin-channel-actions";
 const toggle=document.createElement("button");toggle.className="btn";toggle.type="button";toggle.textContent=row.hidden?"Show":"Hide";toggle.onclick=async()=>{try{await adminApi("/admin/channel",{method:"POST",body:JSON.stringify({id:row.id,action:row.hidden?"show":"hide"})});await loadAdminDashboard();await loadConfig();}catch(e){$("adminMessage").textContent=e.message}};
 const edit=document.createElement("button");edit.className="btn";edit.type="button";edit.textContent="Edit URL";edit.onclick=async()=>{const url=prompt("নতুন stream URL দিন (খালি রাখলে বাতিল):",row.url||"");if(url===null||!url.trim())return;try{await adminApi("/admin/channel",{method:"POST",body:JSON.stringify({id:row.id,action:"url",url:url.trim()})});await loadAdminDashboard();await loadConfig();}catch(e){$("adminMessage").textContent=e.message}};
 actions.append(toggle,edit);item.append(info,actions);root.append(item);});
}
$("adminLoginBtn").addEventListener("click",adminLogin);$("adminPassword").addEventListener("keydown",e=>{if(e.key==="Enter")adminLogin()});$("adminClose").addEventListener("click",closeAdminPanel);$("adminModal").addEventListener("click",e=>{if(e.target===$("adminModal"))closeAdminPanel()});$("adminRefresh").addEventListener("click",loadAdminDashboard);$("adminSearch").addEventListener("input",renderAdminRows);$("adminLogout").addEventListener("click",()=>{adminPasswordInMemory="";closeAdminPanel()});

function rawBaseForChannels(path){return "https://raw.githubusercontent.com/Adnanakhim98/Nova-Tv/main/"+String(path).split("/").map(encodeURIComponent).join("/")+"?v="+Date.now();}
async function loadConfig(){
 if(configLoadInProgress)return;
 configLoadInProgress=true;
 // Start logo-map loading in parallel; match cards must never wait for remote logos.
 const teamLogoPromise=loadTeamLogos().catch(error=>console.warn("Team logo loading skipped:",error));
 const files={Bangla:"./data/bangla.json",Indian:"./data/india.json",Sports:"./data/sports.json",News:"./data/news.json",Music:"./data/music.json",Entertainment:"./data/entertainment.json",Movie:"./data/movie.json",Cartoon:"./data/cartoon.json",Religion:"./data/religion.json",Documentary:"./data/documentary.json"};
 try{
  const results=await Promise.all(Object.entries(files).map(async([category,path])=>{try{const r=await fetch(path,{cache:"no-store"});if(!r.ok)throw new Error("HTTP "+r.status);const d=await r.json();return (d.channels||d.liveTvChannels||[]).filter(c=>c&&c.name).map(c=>({...c,section:"tv",category:c.category||category}));}catch(e){console.warn("Could not load "+path,e);return [];}}));
  channels=results.flat();
  // Show configured channels immediately, then restore the previous match list while fresh data loads.
  render(channels);
  try{
   const cachedMatches=JSON.parse(localStorage.getItem("sportynova_live_matches_v1")||"null");
   if(Array.isArray(cachedMatches)&&cachedMatches.length){
    liveSports=cachedMatches.filter(item=>item&&item.name&&isChannelShown(item));
    render(channels);
   }
  }catch(e){console.info("Local match cache unavailable.");}
  // Auto-discover additional channel JSON files under data/; existing hard-coded files remain supported.
  try{
   const owner="Adnanakhim98",repo="Nova-Tv",branchName="main";
   const treeRes=await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branchName}?recursive=1`,{headers:{Accept:"application/vnd.github+json"},cache:"no-store"});
   if(treeRes.ok){
    const treeData=await treeRes.json();
    const paths=(treeData.tree||[]).filter(x=>x.type==="blob"&&/^data\/.*\.json$/i.test(x.path)&&!/^data\/(?:matches|teams)(?:\/|\.json$)/i.test(x.path)&&!/(?:match[-_ ]?\d*|live[-_ ]?sports|sports[-_ ]?matches)\.json$/i.test(x.path)).map(x=>x.path);
    const known=new Set(channels.map(c=>normalizeSearchText(c.name)));
    for(let i=0;i<paths.length;i+=32){
     const extra=await Promise.all(paths.slice(i,i+32).map(async path=>{
      try{const res=await fetch(rawBaseForChannels(path),{cache:"default"});if(!res.ok)return [];const data=await res.json();const arr=Array.isArray(data)?data:(data.channels||data.liveTvChannels||data.tvChannels||[]);if(!Array.isArray(arr))return [];const cat=path.split("/").pop().replace(/\.json$/i,"");return arr.filter(c=>c&&c.name&&isChannelShown(c)).map(c=>({...c,section:"tv",category:c.category||cat}));}catch(e){return [];}
     }));
     extra.flat().forEach(ch=>{const key=normalizeSearchText(ch.name);if(!known.has(key)){known.add(key);channels.push(ch);}});
    }
   }
  }catch(e){console.info("Extra data JSON discovery skipped; using configured channel files.",e);}
  // Apply server-side admin overrides (hide/show and URL changes) without changing the original JSON files.
  try{const adminData=await adminApi("/status");onlineStatusMap=adminData.statuses||{};const overrides=adminData.overrides||{};channels=channels.map((ch,i)=>{const id=channelAdminId(ch),ov=overrides[id]||overrides[ch.name];return ov?{...ch,...(ov.url?{url:ov.url}:{}),Show:ov.hidden?"N":"Y",id}:({...ch,id});}).filter(isChannelShown);}catch(e){channels=channels.map(ch=>({...ch,id:channelAdminId(ch)})).filter(isChannelShown);}
   // Render Live TV immediately so category menus do not wait for GitHub match discovery.
   render(channels);
  // Discover match JSONs from every tournament subfolder, data/matches/, and
  // any other folder where a file is named match-*.json. No 1..10 limit.
  const repoOwner="Adnanakhim98",repoName="Nova-Tv",branch="main";
  const rawBase=`https://raw.githubusercontent.com/${repoOwner}/${repoName}/${branch}/`;
  const matchCandidates=[];
  const candidatePaths=new Set();
  const addCandidate=path=>{
   if(!path||candidatePaths.has(path))return;
   candidatePaths.add(path);
   matchCandidates.push({path,url:rawBase+path.split("/").map(encodeURIComponent).join("/")});
  };
  try{
   const treeResponse=await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/git/trees/${branch}?recursive=1`,{headers:{Accept:"application/vnd.github+json"},cache:"default"});
   if(!treeResponse.ok)throw new Error("GitHub tree API HTTP "+treeResponse.status);
   const tree=await treeResponse.json();
   (tree.tree||[]).filter(item=>item.type==="blob"&&/\.json$/i.test(item.path)&&(
      /^(?:data\/matches|tournament)\//i.test(item.path) ||
      /(?:^|\/)match[-_ ]?\d*\.json$/i.test(item.path) ||
      /(?:^|\/)(?:live[-_ ]?sports|sports[-_ ]?matches|willow)\.json$/i.test(item.path)
   )).forEach(item=>addCandidate(item.path));
   if(tree.truncated)console.warn("GitHub tree was truncated; numbered-file fallback will also be tried.");
   if(tree.truncated)for(let i=1;i<=100;i++){addCandidate(`data/matches/match-${i}.json`);addCandidate(`tournament/match-${i}.json`);addCandidate(`match-${i}.json`);}
  }catch(error){
   console.warn("Could not discover match JSON files via GitHub API; trying numbered files in common locations.",error);
   for(let i=1;i<=100;i++){addCandidate(`data/matches/match-${i}.json`);addCandidate(`tournament/match-${i}.json`);addCandidate(`match-${i}.json`);}
  }
  const extractMatches=(data,sourcePath="")=>{
   const out=[],seenObjects=new Set();
   const add=item=>{
    if(!item||typeof item!=="object"||Array.isArray(item)||seenObjects.has(item))return;
    seenObjects.add(item);
    const hasSource=!!(item.url||item.streamUrl||item.stream_url||item.link||item.matchLink||item.match_link||item.match_url||item.embedUrl||item.embed_url||item.videoUrl||item.video_url||item.sourceUrl||item.source_url||item.streams||item.servers||item.sources||item.source);
    const identity=!!(item.name||item.title||item.matchName||item.match_name||(item.team1&&item.team2));
    const isYouTubeItem=String(item.type||item.playerType||"").toLowerCase()==="youtube" || /youtube\.com\/(?:embed\/|live\/|watch\?v=)|youtu\.be\//i.test(String(item.url||item.streamUrl||""));
    const matchMeta=!!(item.startTime||item.start_time||item.kickoff||item.kickoffTime||item.matchDate||item.match_date||item.matchTime||item.match_time||item.matchType||item.match_type||item.tournament||item.league||item.status||/live\s*sports|football|cricket|basketball|tennis/i.test(String(item.category||item.section||"")));
    const sourceLooksLikeMatches=/(?:^|\/)(?:match[-_ ]?\d*|willow|live[-_ ]?sports|sports[-_ ]?matches)\.json$/i.test(sourcePath)||/^tournament\//i.test(sourcePath)||/^data\/matches\//i.test(sourcePath);
    const nameLooksLikeMatch=/\b(?:vs?\.?|versus)\b/i.test(String(item.name||item.title||item.matchName||item.match_name||""));
    if(identity&&hasSource&&(matchMeta||(sourceLooksLikeMatches&&nameLooksLikeMatch)||isYouTubeItem))out.push(item);
   };
   const walk=(value,depth=0)=>{
    if(!value||typeof value!=="object"||depth>8)return;
    if(Array.isArray(value)){value.forEach(v=>walk(v,depth+1));return;}
    add(value);
    Object.values(value).forEach(v=>{if(v&&typeof v==="object")walk(v,depth+1);});
   };
   walk(data);
   return out;
  };
  const loadedMatches=[];
  for(let i=0;i<matchCandidates.length;i+=32){
   const batch=matchCandidates.slice(i,i+32);
   const results=await Promise.all(batch.map(async file=>{
    try{
     const r=await fetch(file.url,{cache:"default"});
     if(!r.ok)return [];
     const d=await r.json();
     return extractMatches(d,file.path).map(item=>({...item,name:item.name||item.title||item.matchName||item.match_name||(item.team1&&item.team2?`${item.team1} Vs ${item.team2}`:""),__sourceFile:file.path,section:"liveSports",category:item.category||"Live Sports"})).filter(item=>isChannelShown(item));
    }catch(e){return [];}
   }));
   results.forEach(items=>loadedMatches.push(...items));
  }
  // Keep every enabled/visible match, including ended ones, and sort LIVE first,
  // then today's upcoming, future matches, and ended matches at the bottom.
  const seenMatches=new Set();
  liveSports=sortLiveMatches(loadedMatches).filter(item=>{
   const key=[normalizeTeamName(item.name),matchDateValue(item)].join("|");
   if(seenMatches.has(key))return false;
   seenMatches.add(key);
   return true;
  });
  // Save the latest match data so the next reload can paint match cards immediately.
  try{localStorage.setItem("sportynova_live_matches_v1",JSON.stringify(liveSports));}catch(e){console.info("Match cache storage is full or unavailable.");}
  // Backward compatibility: if no individual match JSON files are available, try the previous combined file.
  if(!liveSports.length){
   for(const path of ["./data/live-sports.json","./live-sports.json"]){
    try{const r=await fetch(path,{cache:"no-store"});if(!r.ok)continue;const d=await r.json();const items=(d.liveSports||d.channels||[]);if(Array.isArray(items)){liveSports=items.filter(c=>c&&c.name&&isChannelShown(c)).map(c=>({...c,section:"liveSports",category:"Live Sports"}));if(liveSports.length)break;}}
    catch(e){console.warn("Could not load "+path,e)}
   }
  }
  // Backward compatibility: use the old combined file only if the separate files are empty.
  if(!channels.length){const r=await fetch("./channels.json",{cache:"no-store"});if(r.ok){const d=await r.json();channels=(d.liveTvChannels||[]).filter(c=>c&&c.name&&isChannelShown(c)).map(c=>({...c,section:"tv"}));if(!liveSports.length)liveSports=(d.liveSports||[]).filter(c=>c&&c.name&&isChannelShown(c)).map(c=>({...c,section:"liveSports",category:"Live Sports"}));}}
 }catch(e){console.warn("Separate JSON load failed",e)}
 if(!liveSports.length)liveSports=defaults.liveSports.map(c=>({...c,section:"liveSports",category:"Live Sports"}));
 render();refreshPublicStatus();
 // Upgrade team initials to their real logos when the background logo map is ready.
 teamLogoPromise.then(()=>render(channels)).catch(error=>console.warn("Logo refresh skipped:",error));
 // If this page was opened from a match share link, open that exact match directly.
 try{
  const params=new URLSearchParams(location.search);
  const legacyMatch=params.get("match");
  const sharedPath=params.get("matchPath");
  const sharedName=params.get("matchName");
  let target=null;
  if(legacyMatch){
   const matchNumber=(legacyMatch.match(/^match-(\d+)$/i)||[])[1];
   if(matchNumber){
    target=liveSports.find(item=>{
     const sourcePath=String(item.__sourceFile||item.sourceFile||item.file||"");
     const sourceNumber=(sourcePath.match(/match-(\d+)\.json/i)||[])[1];
     return sourceNumber===matchNumber;
    })||null;
   }
  }else if(sharedPath&&sharedName){
   // Continue supporting previously shared matchPath + matchName URLs.
   target=liveSports.find(item=>
    String(item.__sourceFile||item.sourceFile||item.file||"")===sharedPath &&
    String(item.name||"")===sharedName
   )||null;
  }
  if(target){
   setTimeout(()=>{
    playChannelDefault(target);
    const player=document.querySelector(".playersticky .playercard");
    if(player)player.scrollIntoView({behavior:"smooth",block:"center"});
   },250);
  }
 }catch(error){console.warn("Could not open shared match link",error);}
 configLoadInProgress=false;
}

// SPORTYNOVA controls connected only to the HLS.js engine.
const playerCard=document.querySelector(".playersticky .playercard");
const screenEl=$("playerScreen"),seekBar=$("seekBar");
const formatClock=seconds=>{
 if(!Number.isFinite(seconds)||seconds<0)return "00:00";
 const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),sec=Math.floor(seconds%60);
 return h?`${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`:`${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
};
$("playPauseBtn").addEventListener("click",()=>{if(video.paused)video.play().catch(()=>{});else video.pause()});
const centerPlayPauseBtn = $("centerPlayPauseBtn");
if(centerPlayPauseBtn){
 centerPlayPauseBtn.addEventListener("click", e=>{
  e.stopPropagation();
  if(video.paused) video.play().catch(()=>{});
  else video.pause();
 });
 const syncCenterPlayPause=()=>{
  centerPlayPauseBtn.textContent=video.paused?"▶":"Ⅱ";
  centerPlayPauseBtn.setAttribute("aria-label",video.paused?"Play video":"Pause video");
 };
 video.addEventListener("play",syncCenterPlayPause);
 video.addEventListener("pause",syncCenterPlayPause);
 video.addEventListener("ended",syncCenterPlayPause);
 syncCenterPlayPause();
}

video.addEventListener("play",()=>{$("playPauseBtn").textContent="Ⅱ"});
video.addEventListener("pause",()=>{$("playPauseBtn").textContent="▶"});
$("muteBtn").addEventListener("click",()=>{video.muted=!video.muted;$("muteBtn").textContent=video.muted?"🔇":"🔊"});
video.addEventListener("volumechange",()=>{$("muteBtn").textContent=(video.muted||video.volume===0)?"🔇":"🔊"});
video.addEventListener("timeupdate",()=>{
 const duration=video.duration;
 if(Number.isFinite(duration)&&duration>0){
  $("currentTime").textContent=formatClock(video.currentTime);$("durationTime").textContent=formatClock(duration);
  if(!seekBar.matches(":active"))seekBar.value=String(Math.round(video.currentTime/duration*1000));
 }else{
  $("currentTime").textContent="LIVE";$("durationTime").textContent=video.seekable.length?"LIVE":"--:--";
  if(video.seekable.length&&!seekBar.matches(":active")){const start=video.seekable.start(0),end=video.seekable.end(video.seekable.length-1);seekBar.value=String(end>start?Math.round((video.currentTime-start)/(end-start)*1000):1000)}
 }
});
seekBar.addEventListener("change",()=>{
 const duration=video.duration;
 if(Number.isFinite(duration)&&duration>0)video.currentTime=Number(seekBar.value)/1000*duration;
 else if(video.seekable.length){const start=video.seekable.start(0),end=video.seekable.end(video.seekable.length-1);video.currentTime=start+(end-start)*Number(seekBar.value)/1000}
});

function applyVideoFit(mode){
 // Smart Fill preserves the original aspect ratio; the screen uses a soft gradient backdrop
 // rather than stretching the picture or cropping its edges. Only Zoom intentionally crops.
 let fit="contain", transform="none";
 if(mode==="fill"){fit="contain";transform="none"}
 else if(mode==="cover"){fit="cover";transform="none"}
 else if(mode==="zoom"){fit="cover";transform="scale(1.12)"}
 else if(mode==="zoomout"){fit="contain";transform="scale(.88)"}
 video.style.setProperty("--video-fit",fit);
 video.style.setProperty("--video-transform",transform);
 video.style.setProperty("object-fit",fit,"important");
 video.style.setProperty("transform",transform,"important");
}

applyVideoFit("contain");
let livezoneFitIndex=0;
const livezoneFitModes=["fill","cover","zoom"];
$("prevChannelBtn").addEventListener("click",()=>stepChannel(-1));
$("nextChannelBtn").addEventListener("click",()=>stepChannel(1));
$("menuChannelBtn").addEventListener("click",()=>{
 const list=document.querySelector(".channelarea");
 if(list)list.scrollIntoView({behavior:"smooth",block:"start"});
});
$("closePlayerBtn").addEventListener("click",()=>{$("stopBtn").click()});
$("volumeSlider").addEventListener("input",e=>{
 video.volume=Number(e.target.value);
 video.muted=video.volume===0;
});
video.addEventListener("volumechange",()=>{
 const slider=$("volumeSlider");
 if(slider)slider.value=String(video.muted?0:video.volume);
});
$("fitBtn").addEventListener("click",()=>{
 livezoneFitIndex=(livezoneFitIndex+1)%livezoneFitModes.length;
 applyVideoFit(livezoneFitModes[livezoneFitIndex]);
 $("fitBtn").textContent=["▣","◩","⛶"][livezoneFitIndex];
 showStatus("Screen fit",["Contain","Cover","Zoom"][livezoneFitIndex]);
});
$("rotateBtn").addEventListener("click",async()=>{
 try{
  if(screen.orientation?.lock){
   if(String(screen.orientation.type||"").startsWith("landscape"))screen.orientation.unlock();
   else await screen.orientation.lock("landscape");
   showStatus("Screen orientation","Landscape orientation updated");
  }else showStatus("Screen orientation","এই ব্রাউজারে orientation lock সমর্থিত নয়");
 }catch(e){showStatus("Screen orientation","ফোনটি Landscape করে নিন");}
});

$("pipBtn").addEventListener("click",async()=>{
 try{if(document.pictureInPictureElement)await document.exitPictureInPicture();else if(document.pictureInPictureEnabled&&video.requestPictureInPicture)await video.requestPictureInPicture();else alert("এই ব্রাউজারে Picture-in-Picture সমর্থিত নয়।")}catch(e){console.warn("PiP unavailable",e)}
});
// Device-aware fullscreen: rotate only phones; keep desktop/tablet layout native.
const isPhoneDevice = () => /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent) &&
  !/Windows NT|Macintosh|X11/i.test(navigator.userAgent);

async function togglePlayerOrientation(){
 const active=!!(document.fullscreenElement||document.webkitFullscreenElement)||playerCard.classList.contains("mobile-rotated")||playerCard.classList.contains("desktop-fallback-fullscreen");
 if(active){exitPlayerFullscreen();return;}
 await enterPlayerFullscreen();
}

async function enterPlayerFullscreen(){
 const mobile=isPhoneDevice();
 playerCard.classList.remove("manual-landscape");
 try{
  // Fullscreen must be requested directly from the user's button gesture.
  if(playerCard.requestFullscreen){
   await playerCard.requestFullscreen();
  }else if(playerCard.webkitRequestFullscreen){
   playerCard.webkitRequestFullscreen();
  }else{
   // AppCreator24/WebView fallback when the Fullscreen API is unavailable.
   if(mobile) playerCard.classList.add("mobile-rotated","manual-landscape");
   else playerCard.classList.add("desktop-fallback-fullscreen");
  }

  // Orientation Lock is supported only by some Android WebViews/browsers.
  if(mobile){
   let locked=false;
   try{
    if(screen.orientation && typeof screen.orientation.lock==="function"){
     await screen.orientation.lock("landscape");
     locked=true;
    }
   }catch(err){ console.warn("Landscape orientation lock unavailable; using CSS fallback.",err); }
   if(!locked){
    playerCard.classList.add("mobile-rotated","manual-landscape");
   }
  }
 }catch(err){
  console.warn("Fullscreen request unavailable:",err);
  if(mobile) playerCard.classList.add("mobile-rotated","manual-landscape");
  else playerCard.classList.add("desktop-fallback-fullscreen");
 }
}

function exitPlayerFullscreen(){
 const isFs=!!(document.fullscreenElement||document.webkitFullscreenElement);
 if(document.exitFullscreen && document.fullscreenElement){
  document.exitFullscreen().catch(()=>{});
 }else if(document.webkitExitFullscreen && document.webkitFullscreenElement){
  document.webkitExitFullscreen();
 }
 playerCard.classList.remove("mobile-rotated","manual-landscape","desktop-fallback-fullscreen","controls-hidden");
 try{screen.orientation?.unlock?.()}catch(e){}
}

$("fullscreenBtn").addEventListener("click",()=>{
 const active=!!(document.fullscreenElement||document.webkitFullscreenElement) ||
  playerCard.classList.contains("mobile-rotated") ||
  playerCard.classList.contains("desktop-fallback-fullscreen");
 if(active) exitPlayerFullscreen();
 else enterPlayerFullscreen();
});

function syncFullscreenState(){
 const active=!!(document.fullscreenElement||document.webkitFullscreenElement);
 if(!active){
  playerCard.classList.remove("mobile-rotated","manual-landscape","desktop-fallback-fullscreen","controls-hidden");
  try{screen.orientation?.unlock?.()}catch(e){}
 }
}
document.addEventListener("fullscreenchange",syncFullscreenState);
document.addEventListener("webkitfullscreenchange",syncFullscreenState);
let lastVideoTap=0;
screenEl.addEventListener("click",e=>{
 if(e.target.closest(".nova-controls,button,select,.playerLoading,.empty"))return;
 const now=Date.now();if(now-lastVideoTap<320){if(video.paused)video.play().catch(()=>{});else video.pause()}lastVideoTap=now;
});
// Automatically hide player controls 4 seconds after the last interaction in all orientations.
let controlsHideTimer=null;
function showPlayerControls(){
 playerCard.classList.remove("controls-hidden");
 if(controlsHideTimer)clearTimeout(controlsHideTimer);
 controlsHideTimer=setTimeout(()=>{
  if(!video.paused && !video.ended) playerCard.classList.add("controls-hidden");
 },4000);
}
["pointermove","pointerdown","touchstart","keydown"].forEach(evt=>playerCard.addEventListener(evt,showPlayerControls,{passive:true}));
video.addEventListener("playing",showPlayerControls);
video.addEventListener("pause",()=>{if(controlsHideTimer)clearTimeout(controlsHideTimer);playerCard.classList.remove("controls-hidden")});

// Swipe gestures: vertical swipe on left = brightness, right = volume; horizontal = seek.
(function installSwipeControls(){
 const hud=$("swipeHud"), icon=$("swipeIcon"), value=$("swipeValue"), label=$("swipeLabel"), fill=$("swipeMeterFill");
 if(!hud||!screenEl)return;
 let start=null, hudTimer=null, gesture=null, startBrightness=1, startVolume=1, startTime=0;
 let brightness=1;
 const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
 function showHud(type,amount,extra){
  const pct=Math.round(clamp(amount,0,1)*100);
  icon.textContent=type==="brightness"?"☀️":type==="volume"?(video.muted||video.volume===0?"🔇":"🔊"):"↔️";
  label.textContent=type==="brightness"?"Brightness":type==="volume"?"Volume":"Seek";
  value.textContent=type==="seek"?(extra||"LIVE"):pct+"%";
  fill.style.width=(type==="seek"?50:pct)+"%";
  hud.classList.add("visible");
  if(hudTimer)clearTimeout(hudTimer);
  hudTimer=setTimeout(()=>hud.classList.remove("visible"),950);
 }
 function getSeekRange(){
  if(Number.isFinite(video.duration)&&video.duration>0)return {start:0,end:video.duration};
  try{if(video.seekable&&video.seekable.length)return {start:video.seekable.start(0),end:video.seekable.end(video.seekable.length-1)}}catch(e){}
  return null;
 }
 screenEl.addEventListener("touchstart",e=>{
  if(e.touches.length!==1||e.target.closest(".nova-controls,button,select,.playerLoading,.empty"))return;
  const t=e.touches[0],rect=screenEl.getBoundingClientRect();
  // Ignore touches on the lower control strip.
  if(t.clientY>rect.bottom-Math.max(58,rect.height*.19))return;
  start={x:t.clientX,y:t.clientY,rect,at:Date.now()};gesture=null;startBrightness=brightness;startVolume=video.volume;startTime=video.currentTime;
 },{passive:true});
 screenEl.addEventListener("touchmove",e=>{
  if(!start||e.touches.length!==1)return;
  const t=e.touches[0],dx=t.clientX-start.x,dy=t.clientY-start.y;
  if(!gesture){if(Math.max(Math.abs(dx),Math.abs(dy))<14)return;gesture=Math.abs(dx)>Math.abs(dy)*1.15?"seek":(start.x<start.rect.left+start.rect.width/2?"brightness":"volume");}
  if(gesture==="brightness"){
   brightness=clamp(startBrightness-dy/start.rect.height,0.15,1.5);
   video.style.filter=`brightness(${brightness})`;
   showHud("brightness",brightness/1.5);
  }else if(gesture==="volume"){
   const vol=clamp(startVolume-dy/start.rect.height,0,1);
   video.volume=vol;video.muted=vol===0;
   showHud("volume",vol);
  }else{
   const range=getSeekRange();if(!range)return;
   const span=range.end-range.start;if(span<=0)return;
   const secondsPerWidth=Math.min(span/2,Math.max(30,span*.12));
   const target=clamp(startTime+(dx/start.rect.width)*secondsPerWidth,range.start,range.end);
   try{video.currentTime=target}catch(err){}
   showHud("seek",0,formatClock(target));
  }
  if(e.cancelable)e.preventDefault();
 },{passive:false});
 const endGesture=()=>{start=null;gesture=null;if(hudTimer)clearTimeout(hudTimer);hudTimer=setTimeout(()=>hud.classList.remove("visible"),650)};
 screenEl.addEventListener("touchend",endGesture,{passive:true});
 screenEl.addEventListener("touchcancel",endGesture,{passive:true});
})();

// Direct player URL support. The requested stream is used when no ?url= parameter exists.
const DEFAULT_STREAM="https://wiselp.wiseplayout.com/9X_Tashan/master.m3u8";
const pageParams=new URLSearchParams(location.search);
const requestedStream=pageParams.get("url");
const requestedName=pageParams.get("name")||"SPORTYNOVA Live";
if(requestedStream)playStream(requestedStream,requestedName,"DIRECT PLAYER");
else playStream(DEFAULT_STREAM,"9X Tashan","DEFAULT STREAM");
loadConfig();
// Re-scan GitHub JSON periodically so newly added/edited match files appear without
// requiring an HTML edit; render status/sort between full data refreshes.
setInterval(()=>render(channels),30000);
setInterval(()=>{if(!configLoadInProgress)loadConfig();},180000);
// Prevent pinch/double-tap zoom on touch browsers; normal vertical scrolling remains enabled.
document.addEventListener("gesturestart", e => e.preventDefault(), {passive:false});
document.addEventListener("gesturechange", e => e.preventDefault(), {passive:false});
document.addEventListener("gestureend", e => e.preventDefault(), {passive:false});
let lastTouchEnd = 0;
document.addEventListener("touchend", e => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) e.preventDefault();
  lastTouchEnd = now;
}, {passive:false});


/* Original script block 4:  */
(() => {
  const card = document.querySelector(".playersticky .playercard");
  const screen = document.getElementById("playerScreen");
  if (!card || !screen) return;
  let hideInfoTimer = null;

  function showInfoBar() {
    card.classList.remove("info-bar-hidden");
    if (hideInfoTimer) clearTimeout(hideInfoTimer);
    hideInfoTimer = setTimeout(() => {
      // Keep the info bar available while the URL/server modal is open.
      if (!document.querySelector(".modal.open")) card.classList.add("info-bar-hidden");
    }, 5000);
  }

  // The player information bar is visible briefly when a channel starts.
  showInfoBar();
  screen.addEventListener("click", (event) => {
    if (event.target.closest(".nova-controls, button, select, .playerLoading, .empty")) return;
    showInfoBar();
  });
  // Reveal the info bar after playback/channel changes, then hide after 5 seconds.
  const video = document.getElementById("video");
  if (video) {
    video.addEventListener("playing", showInfoBar);
    video.addEventListener("loadedmetadata", showInfoBar);
  }
  document.querySelectorAll("#customBtn, #stopBtn, #playCustom, [data-close]").forEach(el => {
    el.addEventListener("click", () => {
      card.classList.remove("info-bar-hidden");
      if (hideInfoTimer) clearTimeout(hideInfoTimer);
      if (!el.matches("[data-close]")) hideInfoTimer = setTimeout(() => {
        if (!document.querySelector(".modal.open")) card.classList.add("info-bar-hidden");
      }, 5000);
    });
  });
  // On screen interaction, reset the timer without interfering with player controls.
  ["pointermove", "touchstart", "keydown"].forEach(type => {
    card.addEventListener(type, event => {
      if (event.target.closest(".playerfoot, .nova-controls, button, select, input")) return;
      showInfoBar();
    }, {passive:true});
  });
})();


/* Original script block 5:  */
(() => {
  const video = document.getElementById("video");
  const button = document.getElementById("centerPlayPause");
  if (!video || !button) return;
  function sync() {
    const playing = !video.paused && !video.ended;
    button.textContent = playing ? "Ⅱ" : "▶";
    button.setAttribute("aria-label", playing ? "ভিডিও Pause করুন" : "ভিডিও চালান");
    button.classList.toggle("is-playing", playing);
  }
  button.addEventListener("click", async (event) => {
    event.preventDefault(); event.stopPropagation();
    if (video.paused) { try { await video.play(); } catch (e) { button.classList.remove("is-playing"); } }
    else video.pause();
    sync();
  });
  video.addEventListener("play", sync);
  video.addEventListener("playing", sync);
  video.addEventListener("pause", sync);
  video.addEventListener("ended", sync);
  sync();
})();


/* Original script block 6:  */
/* Auto-hide player controls after 4 seconds of inactivity.
   Existing playback engines, buttons, IDs and server logic are not replaced. */
(() => {
  const screen = document.getElementById("playerScreen");
  const video = document.getElementById("video");
  if (!screen || !video) return;
  let hideTimer = null;
  const hide = () => {
    if (video.paused || video.ended) return;
    screen.classList.add("controls-hidden");
  };
  const show = () => {
    screen.classList.remove("controls-hidden");
    if (hideTimer) clearTimeout(hideTimer);
    if (!video.paused && !video.ended) hideTimer = setTimeout(hide, 4000);
  };
  ["pointermove","pointerdown","touchstart","mousemove","keydown"].forEach(type => {
    screen.addEventListener(type, show, {passive:true});
  });
  video.addEventListener("playing", show);
  video.addEventListener("play", show);
  video.addEventListener("pause", () => {
    if (hideTimer) clearTimeout(hideTimer);
    screen.classList.remove("controls-hidden");
  });
  video.addEventListener("ended", () => {
    if (hideTimer) clearTimeout(hideTimer);
    screen.classList.remove("controls-hidden");
  });
  screen.addEventListener("focusin", show);
  screen.addEventListener("click", show);
  show();
})();


/* Original script block 7: id="sportynova-media-notification-artwork" */
(function(){
 const artwork = 'data:image/jpeg;base64,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';
 function setSportyNovaMediaArtwork(){
  if(!('mediaSession' in navigator) || typeof MediaMetadata==='undefined') return;
  try { navigator.mediaSession.metadata = new MediaMetadata({
   title: 'SPORTYNOVA 1.0 — Live TV', artist: 'SportyNova',
   artwork: [{src: artwork, sizes: '512x512', type: 'image/jpeg'}]
  }); } catch(e) {}
 }
 document.addEventListener('DOMContentLoaded',setSportyNovaMediaArtwork);
 document.addEventListener('play',setSportyNovaMediaArtwork,true);
 document.addEventListener('loadedmetadata',setSportyNovaMediaArtwork,true);
 setSportyNovaMediaArtwork();
})();


/* Original script block 8: id="sportynova-live-server-popup-autohide-script" */
(()=>{
 const card=document.querySelector('.playercard');
 const screen=document.getElementById('playerScreen');
 const group=document.getElementById('inlineServerGroup');
 if(!card||!screen||!group)return;
 let timer=null;
 function hide(){
   if(timer){clearTimeout(timer);timer=null;}
   card.classList.remove('live-servers-visible');
 }
 function show(){
   if(card.classList.contains('sports-player-mode'))return;
   card.classList.add('live-servers-visible');
   if(timer)clearTimeout(timer);
   timer=setTimeout(()=>{timer=null;card.classList.remove('live-servers-visible');},4000);
 }
 // Tap the video/player to open the server popup; it automatically closes after 4 seconds.
 screen.addEventListener('pointerdown',e=>{
   if(card.classList.contains('sports-player-mode'))return;
   if(e.target.closest('#inlineServerGroup')){show();return;}
   show();
 },{passive:true});
 // Selecting a server keeps the popup briefly visible, then it auto-hides.
 group.addEventListener('click',e=>{
   if(card.classList.contains('sports-player-mode'))return;
   show();
   if(e.target.closest('.inline-server-btn')){
     if(timer)clearTimeout(timer);
     timer=setTimeout(()=>{timer=null;card.classList.remove('live-servers-visible');},4000);
   }
 });
 document.addEventListener('fullscreenchange',()=>{if(!card.classList.contains('sports-player-mode'))hide();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)hide();});
 hide();
})();


/* Original script block 9: id="sportynova-fixed-page-zoom-script" */
(() => {
  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) {
    viewport.setAttribute(
      'content',
      'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover'
    );
  }

  // Block only multi-finger gestures. One-finger scrolling and player swipes are untouched.
  const blockMultiTouch = (event) => {
    if (event.touches && event.touches.length > 1) {
      event.preventDefault();
    }
  };
  document.addEventListener('touchstart', blockMultiTouch, { passive: false, capture: true });
  document.addEventListener('touchmove', blockMultiTouch, { passive: false, capture: true });

  // Safari/iOS gesture events and desktop trackpad/browser zoom.
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(type => {
    document.addEventListener(type, event => event.preventDefault(), { passive: false });
  });
  document.addEventListener('wheel', event => {
    if (event.ctrlKey || event.metaKey) event.preventDefault();
  }, { passive: false });

  // Prevent keyboard zoom shortcuts where the page has focus.
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) &&
        ['+', '-', '=', '0'].includes(event.key)) {
      event.preventDefault();
    }
  }, { capture: true });

  // Keep the viewport fixed if a browser reports a pinch-scale change.
  if (window.visualViewport) {
    let correcting = false;
    window.visualViewport.addEventListener('resize', () => {
      if (correcting || window.visualViewport.scale === 1) return;
      correcting = true;
      requestAnimationFrame(() => {
        if (viewport) {
          viewport.setAttribute(
            'content',
            'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover'
          );
        }
        correcting = false;
      });
    }, { passive: true });
  }
})();


/* Original script block 10: id="sportynova-pull-to-refresh" */
(() => {
  const area=document.querySelector('.channelarea');
  if(!area) return;
  const indicator=document.createElement('div');
  indicator.id='sportynovaPullIndicator';
  indicator.innerHTML='<span class="pull-arrow">↓</span><span class="pull-label">Refresh SPORTYNOVA</span>';
  document.body.appendChild(indicator);

  let startY=0, pulling=false, distance=0, active=false;
  const threshold=76, maxPull=112;
  const blocked=el=>!!el.closest('input,textarea,select,button,a,.screen,.playercard,.modal,.nova-controls,.inline-server-group');

  area.addEventListener('touchstart',e=>{
    if(e.touches.length!==1 || area.scrollTop>0 || blocked(e.target)) return;
    startY=e.touches[0].clientY;
    pulling=true;active=false;distance=0;
  },{passive:true});

  area.addEventListener('touchmove',e=>{
    if(!pulling || e.touches.length!==1) return;
    const dy=e.touches[0].clientY-startY;
    if(dy<=0){pulling=false;return;}
    if(area.scrollTop>0){pulling=false;return;}
    if(dy>8){
      active=true;
      distance=Math.min(maxPull,dy*.58);
      indicator.style.transform=`translate(-50%,${Math.max(0,distance-52)}px)`;
      indicator.style.opacity=String(Math.min(1,distance/42));
      indicator.classList.add('visible');
      indicator.querySelector('.pull-label').textContent=distance>=threshold?'Release to refresh':'Pull down to refresh';
      indicator.querySelector('.pull-arrow').textContent=distance>=threshold?'↻':'↓';
      e.preventDefault();
    }
  },{passive:false});

  const finish=()=>{
    if(!pulling)return;
    pulling=false;
    if(active && distance>=threshold){
      indicator.classList.add('refreshing','visible');
      indicator.querySelector('.pull-arrow').textContent='↻';
      indicator.querySelector('.pull-label').textContent='Refreshing…';
      window.location.reload();
      return;
    }
    indicator.classList.remove('visible');
    indicator.style.transform='';
    indicator.style.opacity='';
  };
  area.addEventListener('touchend',finish,{passive:true});
  area.addEventListener('touchcancel',finish,{passive:true});
})();
