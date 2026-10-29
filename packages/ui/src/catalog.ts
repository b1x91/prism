/**
 * 상품 목록 받기 (v3.124): 상점 업데이트를 앱 업데이트와 따로.
 * 켤 때·당겨서 새로고침 때 서버 `/shop/catalog` 를 받아 상품 표를 갈아 끼우고, 새 상품 모양(looks.css)을 붙인다.
 * 받지 못하면 이 빌드에 들어 있던 목록을 그대로 쓴다.
 */
import { useSyncExternalStore } from 'react';
import { applyCatalog, onCatalog, onPullRefresh, setShopAssetBase, shopCssUrl, shopRevision, type Api } from '@prism/core';

/** 상품 표가 바뀌면 다시 그리기 */
export const useShopRev = () => useSyncExternalStore(onCatalog, shopRevision, shopRevision);

function linkCss(href = shopCssUrl(), fallback = true) {
  const id = 'prism-shop-looks';
  const old = document.getElementById(id) as HTMLLinkElement | null;
  if (old?.getAttribute('href') === href) return;
  const l = document.createElement('link');
  l.id = id; l.rel = 'stylesheet'; l.href = href;
  // 바꿀 때 새 것을 다 받은 뒤 예전 것을 뗀다 (모양이 잠깐 빠지지 않게)
  l.onload = () => old?.remove();
  // 웹에서 못 받으면(인터넷 끊김 등) 이 빌드에 든 파일로
  l.onerror = () => { l.remove(); if (fallback && href !== '/shop/looks.css') linkCss('/shop/looks.css', false); };
  document.head.appendChild(l);
}

/** base: 상점 그림·looks.css 를 받을 곳 (앱은 웹 주소, 웹은 '/') */
export function startShopCatalog(api: Api, base: string) {
  setShopAssetBase(base);
  const load = () => api.get('/shop/catalog').then((c) => { applyCatalog(c); linkCss(); }).catch(() => linkCss());
  void load();
  return onPullRefresh(() => void load());
}
