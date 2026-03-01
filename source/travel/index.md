---
title: 旅行足迹
description: 记录我的旅行足迹，探索世界的每一个角落
layout: page
banner_img: /img/banner.webp
banner_img_height: 60
comments: false
---

<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

<style>
  /* 地图容器基础样式 */
  #travel-map {
    height: 600px;
    width: 100%;
    border-radius: 16px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.1);
    background: #f8f9fa;
    margin: 20px 0;
    position: relative;
    overflow: hidden;
  }

  /* 顶部年份筛选器容器：负责居中定位 */
  .year-filter-wrapper {
    position: absolute;
    top: 20px;
    left: 0;
    right: 0;
    z-index: 1000;
    display: flex;
    justify-content: center;
    pointer-events: none; /* 让容器不遮挡地图点击，仅内部按钮可点 */
  }

  /* 滚动条容器：毛玻璃效果与横向滚动 */
  #year-filter {
    pointer-events: auto;
    display: flex;
    gap: 8px;
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.75);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.4);
    border-radius: 50px;
    max-width: 85%;
    overflow-x: auto;
    white-space: nowrap;
    scrollbar-width: none; /* Firefox 隐藏滚动条 */
    box-shadow: 0 4px 20px rgba(0,0,0,0.08);
  }

  /* 隐藏 Chrome/Safari 滚动条 */
  #year-filter::-webkit-scrollbar {
    display: none;
  }

  /* 年份标签样式 */
  .year-item {
    display: inline-block;
    padding: 8px 20px;
    cursor: pointer;
    border-radius: 40px;
    font-size: 14px;
    font-weight: 500;
    color: #444;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    user-select: none;
  }

  .year-item:hover {
    background: rgba(255, 255, 255, 0.9);
  }

  .year-item.active {
    background: #2d3436;
    color: #ffffff;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  }

  /* 气泡弹窗样式优化 */
  .leaflet-popup-content-wrapper { border-radius: 12px; padding: 5px; }
  .popup-container { min-width: 160px; padding: 5px; line-height: 1.5; }
  .popup-title { font-size: 16px; font-weight: bold; color: #2d3436; display: block; margin-bottom: 4px; }
  .popup-date { font-size: 11px; color: #636e72; background: #f1f2f6; padding: 2px 8px; border-radius: 20px; text-transform: uppercase; }
  .popup-notes { font-size: 13px; color: #444; margin-top: 10px; border-top: 1px solid #eee; padding-top: 8px; }
</style>

<div id="travel-map">
  <div class="year-filter-wrapper">
    <div id="year-filter">
      <div class="year-item active" id="filter-all" onclick="filterYear('全部')"> 全部足迹</div>
    </div>
  </div>
</div>

<script>
let allData = [];
let markerLayer = L.featureGroup();
// 初始化地图，使用更简洁的底图风格
const map = L.map('travel-map', { 
  scrollWheelZoom: false,
  zoomControl: false // 隐藏默认缩放按钮，让界面更清爽
}).setView([35, 105], 4);

// 添加缩放按钮到右下角
L.control.zoom({ position: 'bottomright' }).addTo(map);

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; CARTO'
}).addTo(map);

async function fetchTravelData() {
  const dataUrl = 'https://script.google.com/macros/s/AKfycbwhCQP1IOpjJ-eBoe4nftp0Nzl-KYZNlkIMzuIq3gVKcUU6UAogZC-NNyfBsnbNczxMPQ/exec';

  try {
    const response = await fetch(dataUrl);
    allData = await response.json();
    
    if (!allData || allData.length === 0) return;

    const years = new Set();
    allData.forEach(item => {
      const year = item.date ? item.date.toString().substring(0, 4) : '未知';
      if (/^\d{4}$/.test(year)) years.add(year);
    });

    const filterContainer = document.getElementById('year-filter');
    // 按年份倒序排列
    Array.from(years).sort((a, b) => b - a).forEach(year => {
      const div = document.createElement('div');
      div.className = 'year-item';
      div.innerText = year;
      div.id = 'filter-' + year;
      div.onclick = (e) => {
        filterYear(year);
        // 点击后自动平滑滚动到容器中间
        e.target.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      };
      filterContainer.appendChild(div);
    });

    renderMarkers('全部');

  } catch (error) {
    console.error('加载失败:', error);
    document.getElementById('travel-map').innerHTML = `<div style="text-align:center;padding-top:280px;color:#999;">数据加载失败，请检查网络</div>`;
  }
}

function renderMarkers(selectedYear) {
  markerLayer.clearLayers();

  allData.forEach(item => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lng);
    const itemYear = item.date ? item.date.toString().substring(0, 4) : '';

    if (!isNaN(lat) && !isNaN(lng)) {
      if (selectedYear === '全部' || itemYear === selectedYear) {
        // 使用更有质感的圆形标记
        const marker = L.circleMarker([lat, lng], {
          radius: 8,
          fillColor: selectedYear === '全部' ? "#3498db" : "#ff7675",
          color: "#fff",
          weight: 2,
          fillOpacity: 0.9
        });

        marker.bindPopup(`
          <div class="popup-container">
            <span class="popup-title">📍 ${item.name}</span>
            <span class="popup-date">${item.date || '未知日期'}</span>
            <p class="popup-notes">${item.notes || '这里留下了一段美好的回忆~'}</p>
          </div>
        `);
        markerLayer.addLayer(marker);
      }
    }
  });

  markerLayer.addTo(map);

  if (markerLayer.getLayers().length > 0) {
    const layers = markerLayer.getLayers();
    if (layers.length === 1) {
      map.setView(layers[0].getLatLng(), 10, { animate: true });
    } else {
      map.fitBounds(markerLayer.getBounds().pad(0.2), { 
        animate: true, 
        maxZoom: 10 
      });
    }
  }
}

function filterYear(year) {
  document.querySelectorAll('.year-item').forEach(el => el.classList.remove('active'));
  
  if (year === '全部') {
    document.getElementById('filter-all').classList.add('active');
  } else {
    const target = document.getElementById('filter-' + year);
    if(target) target.classList.add('active');
  }
  
  renderMarkers(year);
}

fetchTravelData();
</script>