import {library} from './libraries.js';
import {validPoint,segments} from './tracking-model.js';
export async function positionMap(container,rows,options={}){
 if(!document.querySelector('link[data-map-style]')){const style=document.createElement('link');style.rel='stylesheet';style.href='/vendor/leaflet.css';style.dataset.mapStyle='true';document.head.append(style);}
 const L=await library('/vendor/leaflet.js','L');if(!container.isConnected||options.isCurrent&&!options.isCurrent())return null;
 const map=L.map(container,{preferCanvas:true,fadeAnimation:!options.pin}).setView([-5.52,-47.48],11);
 L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}).addTo(map);
 const points=rows.filter(validPoint);for(const part of segments(points))if(part.length>1)L.polyline(part.map(r=>[+r.lat,+r.lng]),{color:'#147bce',weight:4}).addTo(map);
 let marker;const select=(r,{pan=true}={})=>{if(!validPoint(r))return false;if(marker)marker.remove();marker=options.pin?L.marker([+r.lat,+r.lng],{icon:L.divIcon({className:"stock-map-pin",html:'<img src="/map-pin-simple.png" alt="Marcador do aparelho" data-tone="'+(options.pinColor?.(r)==='#d62f49'?'off':options.pinColor?.(r)==='#728397'?'unknown':'on')+'">',iconSize:[80,100],iconAnchor:[40,84],popupAnchor:[0,-64]})}).addTo(map):L.circleMarker([+r.lat,+r.lng],{radius:8,color:'#fff',weight:3,fillColor:r.memory?'#d38b00':/^(1|true|ligad[oa])$/i.test(String(r.ignition))?'#09a77a':'#e34149',fillOpacity:1}).addTo(map);const text=document.createElement('span');text.textContent=(r.gps_at||'Posição')+' • '+(r.speed??'—')+' km/h';marker.bindPopup(options.popup?options.popup(r):text,{className:options.popup?'compact-position-popup':'',maxWidth:290,autoPan:pan});if(pan)map.panTo(marker.getLatLng());if(options.openPopup)marker.openPopup();return true;};
 const fit=()=>{if(points.length)map.fitBounds(L.latLngBounds(points.map(r=>[+r.lat,+r.lng])),{padding:[25,25],maxZoom:16});};fit();if(points.length)select(points[0]);
 let disposed=false;const resize=new ResizeObserver(()=>{if(!disposed)map.invalidateSize();});const dispose=()=>{if(disposed)return;disposed=true;resize.disconnect();observer.disconnect();map.remove();};resize.observe(container);const observer=new MutationObserver(()=>{if(!container.isConnected)dispose();});observer.observe(document.body,{childList:true,subtree:true});
 return {map,select,fit,dispose};
}
