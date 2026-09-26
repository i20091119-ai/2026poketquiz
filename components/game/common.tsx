"use client";
import { useState } from 'react';
import { ASSETS } from '@/lib/assets';
import { TYPE_INFO, type TypeKey } from '@/lib/game-config';
import { pokemonImages, species } from '@/lib/pokedex';

/** 공식 도감 이미지 → pokemon.com → 임시 이미지 순서로 시도합니다. */
export function PokemonImage({ id, className, size }: { id: number; className?: string; size?: number }) {
  const sources = [...pokemonImages(id), ASSETS.pokemonPlaceholder];
  const [index, setIndex] = useState(0);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={id}
      className={className}
      src={sources[index]}
      alt={species(id).name}
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setIndex(i => Math.min(i + 1, sources.length - 1))}
    />
  );
}

export function TypeBadge({ type, amount, small }: { type: TypeKey; amount?: string | number; small?: boolean }) {
  const info = TYPE_INFO[type];
  return (
    <span className={'type-badge' + (small ? ' small' : '')} style={{ background: info.color }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ASSETS.type(type)} alt="" aria-hidden />
      {info.label}{amount !== undefined && <b>{amount}</b>}
    </span>
  );
}

/**
 * 같은 사이트 안에서 페이지를 옮길 때 씁니다. 게임 화면이 링크 누르기를 가로채도 확실히 이동하도록
 * 브라우저에게 직접 주소를 바꾸라고 시킵니다.
 */
export const goTo = (path: string) => (e: { preventDefault: () => void }) => { e.preventDefault(); window.location.assign(path); };

export const dexNo = (id: number) => 'No.' + String(id).padStart(4, '0');

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({ error: '서버 응답을 읽지 못했어요.' }));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? '요청에 실패했어요.');
  return data as T;
}
export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, cache: 'no-store' });
  const data = await res.json().catch(() => ({ error: '서버 응답을 읽지 못했어요.' }));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? '요청에 실패했어요.');
  return data as T;
}
