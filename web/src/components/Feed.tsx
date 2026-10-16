import { ArrowDown, ChatsCircle, Diamond, Gift, Globe, HandWaving, ShareFat, UserPlus } from '@phosphor-icons/react';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { fmt, fmtTime } from '../lib/format';
import { useApp } from '../lib/store';
import { isForeign, type ChatEvent, type GiftEvent, type LiveEvent, type SocialEvent } from '../lib/types';
import { Avatar, Chip, cx, EmptyState } from './ui';

function LangTag({ e }: { e: ChatEvent }) {
  const a = e.analysis;
  if (a.status === 'pending')
    return <span className="rounded-md bg-gold/10 px-1.5 py-px text-[11px] font-semibold text-gold">đang dịch…</span>;
  if (a.status === 'error') return <span className="rounded-md bg-brand-500/15 px-1.5 py-px text-[11px] font-semibold text-brand-300">lỗi dịch</span>;
  if (isForeign(e))
    return (
      <span className="rounded-md bg-foreign/10 px-1.5 py-px font-mono text-[11px] font-semibold text-foreign uppercase" title={a.result?.langName}>
        {a.result!.lang}
      </span>
    );
  return null;
}

const ChatRow = memo(function ChatRow({ e, selected, onSelect }: { e: ChatEvent; selected: boolean; onSelect: (id: string) => void }) {
  const foreign = isForeign(e);
  return (
    <button
      type="button"
      onClick={() => onSelect(e.id)}
      aria-current={selected}
      className={cx(
        'group relative flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150 animate-enter',
        selected ? 'bg-ink-800 ring-1 ring-inset ring-brand-500/60' : 'hover:bg-ink-850',
      )}
    >
      {foreign ? <span className="absolute top-3 bottom-3 left-0 w-[3px] rounded-full bg-foreign" aria-hidden /> : null}
      <Avatar id={e.user.id} name={e.user.name} src={e.user.avatar} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs text-ink-400">
          <span className="truncate font-medium text-ink-300">{e.user.name}</span>
          <span className="shrink-0 font-mono tabular">{fmtTime(e.ts)}</span>
          <LangTag e={e} />
        </div>
        <p className="mt-0.5 text-[16px] leading-snug break-words text-ink-50">{e.text}</p>
        {foreign && e.analysis.result?.translation ? (
          <p className="mt-1 text-[15px] leading-snug text-foreign">{e.analysis.result.translation}</p>
        ) : null}
      </div>
    </button>
  );
});

const GiftRow = memo(function GiftRow({ e }: { e: GiftEvent }) {
  const total = e.count * e.diamonds;
  return (
    <div className={cx('flex items-center gap-3 rounded-xl bg-gold/[0.06] px-3 py-2.5 ring-1 ring-inset ring-gold/15 animate-enter', !e.final && 'opacity-70')}>
      {e.image ? (
        <img src={e.image} alt={e.giftName} referrerPolicy="no-referrer" className="size-9 shrink-0 object-contain" />
      ) : (
        <div className="grid size-9 shrink-0 place-items-center rounded-[30%] bg-gold/15 text-gold">
          <Gift size={18} weight="fill" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs text-ink-400">
          <span className="truncate font-medium text-ink-300">{e.user.name}</span>
          <span className="shrink-0 font-mono tabular">{fmtTime(e.ts)}</span>
          {!e.final ? <span className="text-gold">combo…</span> : null}
        </div>
        <p className="mt-0.5 text-[15px] font-semibold text-gold">
          tặng {e.giftNameVi} <span className="font-mono tabular">×{e.count}</span>
        </p>
      </div>
      {total ? (
        <span className="flex shrink-0 items-center gap-1 font-mono text-sm font-semibold text-gold tabular">
          <Diamond size={14} weight="fill" />
          {fmt(total)}
        </span>
      ) : null}
    </div>
  );
});

const SOCIAL = {
  follow: { icon: UserPlus, text: 'đã theo dõi bạn', cls: 'text-live' },
  share: { icon: ShareFat, text: 'đã chia sẻ buổi live', cls: 'text-live' },
  member: { icon: HandWaving, text: 'vừa vào phòng', cls: 'text-ink-400' },
};

const SocialRow = memo(function SocialRow({ e }: { e: SocialEvent }) {
  const s = SOCIAL[e.kind];
  const Icon = s.icon;
  return (
    <div className={cx('flex items-center gap-2 px-3 py-1 text-[13px] animate-enter', s.cls)}>
      <Icon size={14} weight="bold" className="shrink-0" />
      <span className="truncate">
        <span className="font-medium">{e.user.name}</span> <span className="opacity-80">{s.text}</span>
      </span>
    </div>
  );
});

function visible(e: LiveEvent, foreignOnly: boolean, showJoins: boolean) {
  if (e.kind === 'member') return showJoins && !foreignOnly;
  if (!foreignOnly) return true;
  if (e.kind === 'gift') return true;
  if (e.kind === 'chat') return e.analysis.status === 'pending' || isForeign(e);
  return false;
}

export function Feed() {
  const events = useApp((s) => s.events);
  const selectedId = useApp((s) => s.selectedId);
  const filters = useApp((s) => s.filters);
  const setFilters = useApp((s) => s.setFilters);
  const select = useApp((s) => s.select);
  const status = useApp((s) => s.status);

  const list = useMemo(() => events.filter((e) => visible(e, filters.foreignOnly, filters.showJoins)), [events, filters]);
  const foreignCount = useMemo(() => events.filter(isForeign).length, [events]);

  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [unseen, setUnseen] = useState(0);
  const lastLen = useRef(list.length);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const added = list.length - lastLen.current;
    lastLen.current = list.length;
    if (stick.current) el.scrollTop = el.scrollHeight;
    else if (added > 0) setUnseen((n) => n + added);
  }, [list]);

  useEffect(() => {
    stick.current = true;
    setUnseen(0);
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [filters]);

  const onScroll = () => {
    const el = scroller.current!;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (stick.current) setUnseen(0);
  };

  const jump = () => {
    const el = scroller.current!;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    stick.current = true;
    setUnseen(0);
  };

  const onSelect = (id: string) => select(id, true);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-ink-800 px-3 py-2.5">
        <Chip active={!filters.foreignOnly} onClick={() => setFilters({ foreignOnly: false })}>
          Tất cả
        </Chip>
        <Chip active={filters.foreignOnly} onClick={() => setFilters({ foreignOnly: true })}>
          <Globe size={14} weight="bold" />
          Nước ngoài
          {foreignCount ? <span className="font-mono text-[11px] opacity-70 tabular">{foreignCount}</span> : null}
        </Chip>
        <div className="flex-1" />
        <Chip active={filters.showJoins} onClick={() => setFilters({ showJoins: !filters.showJoins })}>
          <HandWaving size={14} weight="bold" />
          <span className="hidden sm:inline">Người vào</span>
        </Chip>
      </div>

      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain p-2">
        {list.length === 0 ? (
          <EmptyState icon={<ChatsCircle size={26} />} title={status.state === 'idle' ? 'Chưa kết nối buổi live' : filters.foreignOnly ? 'Chưa có bình luận nước ngoài' : 'Đang chờ bình luận đầu tiên'}>
            {status.state === 'idle'
              ? 'Nhập username TikTok ở phía trên rồi bấm Kết nối. Bấm Demo nếu muốn thử trước khi lên sóng.'
              : 'Bình luận sẽ xuất hiện ở đây ngay khi người xem gõ.'}
          </EmptyState>
        ) : (
          list.map((e) =>
            e.kind === 'chat' ? (
              <ChatRow key={e.id} e={e} selected={e.id === selectedId} onSelect={onSelect} />
            ) : e.kind === 'gift' ? (
              <GiftRow key={e.id} e={e} />
            ) : (
              <SocialRow key={e.id} e={e} />
            ),
          )
        )}
      </div>

      {unseen > 0 ? (
        <button
          type="button"
          onClick={jump}
          className="pressable absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-ink-100 px-4 py-2 text-sm font-semibold text-ink-950 shadow-[0_10px_30px_-6px_rgba(0,0,0,0.6)] animate-enter"
        >
          <ArrowDown size={15} weight="bold" />
          {unseen} mới
        </button>
      ) : null}
    </div>
  );
}
