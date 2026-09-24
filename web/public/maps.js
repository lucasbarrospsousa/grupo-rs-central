import {library} from './libraries.js';
import {validPoint,segments} from './tracking-model.js';
export async function positionMap(container,rows){
 if(!document.querySelector('link[data-map-style]')){const style=document.createElement('link');style.rel='stylesheet';style.href='/vendor/leaflet.css';style.dataset.mapStyle='true';document.head.append(style);}
 const L=await library('/vendor/leaflet.js','L');if(!container.isConnected)return null;
 const map=L.map(container,{preferCanvas:true}).setView([-5.52,-47.48],11);
 L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}).addTo(map);
 const points=rows.filter(validPoint);for(const part of segments(points))L.polyline(part.map(r=>[+r.lat,+r.lng]),{color:'#147bce',weight:4}).addTo(map);
 let marker;const select=r=>{if(!validPoint(r))return false;if(marker)marker.remove();marker=L.circleMarker([+r.lat,+r.lng],{radius:8,color:'#fff',weight:3,fillColor:r.memory?'#d38b00':/^(1|true|ligad[oa])$/i.test(String(r.ignition))?'#09a77a':'#e34149',fillOpacity:1}).addTo(map);const text=document.createElement('span');text.textContent=(r.gps_at||'Posição')+' • '+(r.speed??'—')+' km/h';marker.bindPopup(text);map.panTo(marker.getLatLng());return true;};
 const fit=()=>{if(points.length)map.fitBounds(L.latLngBounds(points.map(r=>[+r.lat,+r.lng])),{padding:[25,25],maxZoom:16});};fit();if(points.length)select(points[0]);
 const resize=new ResizeObserver(()=>map.invalidateSize());resize.observe(container);const observer=new MutationObserver(()=>{if(!container.isConnected){resize.disconnect();observer.disconnect();map.remove();}});observer.observe(document.body,{childList:true,subtree:true});
 return {map,select,fit};
}
