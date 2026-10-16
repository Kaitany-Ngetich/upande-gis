// The map itself: one Leaflet page shared by phone (WebView) and web
// (iframe). Points/positions arrive as messages, taps go back as messages.

export interface MapPoint {
  id: string;
  lat: number;
  lon: number;
  label: string;
  title: string;
  color: string;
}

export interface MapPosition {
  lat: number;
  lon: number;
  accuracy?: number | null;
}

export function mapHtml(points: MapPoint[], selected?: string | null): string {
  const data = JSON.stringify({ points, selected: selected ?? null });
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
html,body,#map{margin:0;height:100%;background:#1d2a22}
.wp{width:30px;height:30px;border-radius:50%;color:#fff;font:700 14px/30px system-ui,sans-serif;text-align:center;
  border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)}
.wp.sel{transform:scale(1.25);box-shadow:0 0 0 4px rgba(255,255,255,.55),0 1px 6px rgba(0,0,0,.5)}
.me{width:16px;height:16px;border-radius:50%;background:#2563EB;border:3px solid #fff;box-shadow:0 0 0 6px rgba(37,99,235,.25)}
.leaflet-control-layers{font:13px system-ui,sans-serif}
</style></head><body><div id="map"></div><script>
var D=${data};
var map=L.map('map',{zoomControl:false,attributionControl:false});
var sat=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:20,maxNativeZoom:18}).addTo(map);
var osm=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:20,maxNativeZoom:19});
L.control.layers({'Satellite':sat,'Map':osm},null,{position:'topright'}).addTo(map);
function send(m){var s=JSON.stringify(m);if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(s);else if(window.parent!==window)window.parent.postMessage(s,'*');}
var layer=L.layerGroup().addTo(map),route=null,me=null,meCircle=null,fitted=false;
function draw(points,selected){
  layer.clearLayers();if(route)map.removeLayer(route);
  var ll=points.map(function(p){return[p.lat,p.lon]});
  if(ll.length>1)route=L.polyline(ll,{color:'#ffffff',weight:3,opacity:.85,dashArray:'6 8'}).addTo(map);
  points.forEach(function(p){
    var icon=L.divIcon({className:'',html:'<div class="wp'+(p.id===selected?' sel':'')+'" style="background:'+p.color+'">'+p.label+'</div>',iconSize:[30,30],iconAnchor:[15,15]});
    L.marker([p.lat,p.lon],{icon:icon,title:p.title}).on('click',function(){send({type:'select',id:p.id})}).addTo(layer);
  });
  if(!fitted&&ll.length){map.fitBounds(L.latLngBounds(ll).pad(0.35),{maxZoom:18});fitted=true;}
}
function setMe(lat,lon,acc){
  if(!me){me=L.marker([lat,lon],{icon:L.divIcon({className:'',html:'<div class="me"></div>',iconSize:[16,16],iconAnchor:[8,8]}),zIndexOffset:1000}).addTo(map);
    meCircle=L.circle([lat,lon],{radius:acc||10,color:'#2563EB',weight:1,fillOpacity:.12}).addTo(map);}
  else{me.setLatLng([lat,lon]);meCircle.setLatLng([lat,lon]);if(acc)meCircle.setRadius(acc);}
}
function onMsg(e){try{var m=typeof e.data==='string'?JSON.parse(e.data):e.data;
  if(m.type==='me')setMe(m.lat,m.lon,m.accuracy);
  if(m.type==='points')draw(m.points,m.selected);
  if(m.type==='focus')map.setView([m.lat,m.lon],Math.max(map.getZoom(),18));}catch(_){}}
window.addEventListener('message',onMsg);document.addEventListener('message',onMsg);
window.upande={me:setMe,draw:draw};
draw(D.points,D.selected);
if(!D.points.length)map.setView([0.07,35.75],15);
send({type:'ready'});
</script></body></html>`;
}
