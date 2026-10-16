import { ArrowsClockwise, Copy, Lightbulb, PaperPlaneRight, Play, SpeakerSimpleHigh, Stop, Translate, Warning, X } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { live } from '../live/engine';
import { api, errorMessage } from '../lib/api';
import { speakNow, useAudio } from '../lib/audio';
import { fmtTime, langName } from '../lib/format';
import { markManual, setAutoFollow, useApp } from '../lib/store';
import { isForeign, type ChatEvent, type Suggestion } from '../lib/types';
import { Avatar, Button, cx, EmptyState, Kbd } from './ui';

function PlayButton({ playKey, text, lang, size = 'lg' }: { playKey: string; text: string; lang: string; size?: 'lg' | 'sm' }) {
  const playing = useAudio((s) => s.playingKey === playKey);
  return (
    <button
      type="button"
      onClick={() => {
        markManual();
        speakNow(playKey, text, lang);
      }}
      aria-label={playing ? 'Dừng đọc' : 'Phát giọng đọc bằng tiếng gốc'}
      title={playing ? 'Dừng' : 'Máy đọc câu này bằng tiếng gốc'}
      className={cx(
        'pressable grid shrink-0 place-items-center rounded-full',
        size === 'lg' ? 'size-14' : 'size-9',
        playing ? 'bg-live text-ink-950' : 'bg-brand-500 text-white hover:bg-brand-400',
      )}
    >
      {playing ? <Stop size={size === 'lg' ? 22 : 15} weight="fill" /> : <Play size={size === 'lg' ? 22 : 15} weight="fill" className="translate-x-px" />}
    </button>
  );
}

function SuggestionCard({ s, index, lang, eventId }: { s: Suggestion; index: number | 'custom'; lang: string; eventId: string }) {
  const key = `${eventId}:${index}`;
  const playing = useAudio((st) => st.playingKey === key);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(s.text);
      toast.success('Đã chép câu gốc');
    } catch {
      toast.error('Không chép được — trình duyệt chặn quyền clipboard');
    }
  };

  return (
    <article
      className={cx(
        'group rounded-2xl p-4 ring-1 ring-inset transition-colors duration-200 animate-enter sm:p-5',
        playing ? 'bg-live/[0.06] ring-live/40' : index === 'custom' ? 'bg-foreign/[0.04] ring-foreign/25' : 'bg-ink-850 ring-ink-800',
      )}
      style={{ animationDelay: typeof index === 'number' ? `${index * 60}ms` : undefined }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className={cx('text-xs font-semibold', index === 'custom' ? 'text-foreign' : 'text-ink-500')}>
          {index === 'custom' ? 'Câu của bạn' : `Gợi ý ${index + 1}`}
        </span>
        {typeof index === 'number' && index < 3 ? (
          <span className="hidden lg:inline" title={`Bấm phím ${index + 1} để phát`}>
            <Kbd>{index + 1}</Kbd>
          </span>
        ) : null}
        <div className="flex-1" />
        <button
          type="button"
          onClick={copy}
          className="pressable rounded-lg p-1.5 text-ink-500 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-ink-700 hover:text-ink-200 focus-visible:opacity-100"
          aria-label="Chép câu gốc"
        >
          <Copy size={15} />
        </button>
      </div>
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[24px] leading-[1.25] font-bold tracking-tight text-balance text-ink-50 sm:text-[28px]">{s.phonetic || s.text}</p>
          <p className="mt-2 text-[15px] leading-snug text-ink-400">{s.text}</p>
          <p className="mt-1 text-[15px] leading-snug text-foreign">{s.meaning}</p>
        </div>
        <PlayButton playKey={key} text={s.text} lang={lang} />
      </div>
    </article>
  );
}

function SuggestionSkeleton() {
  return (
    <div className="space-y-3" aria-label="Đang tạo gợi ý">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl bg-ink-850 p-5 ring-1 ring-inset ring-ink-800">
          <div className="skeleton mb-3 h-3 w-16 rounded" />
          <div className="skeleton h-7 w-4/5 rounded-lg" />
          <div className="skeleton mt-3 h-4 w-3/5 rounded" />
          <div className="skeleton mt-2 h-4 w-2/5 rounded" />
        </div>
      ))}
    </div>
  );
}

function CustomReply({ e }: { e: ChatEvent }) {
  const r = e.analysis.result!;
  const custom = useApp((s) => s.customReplies[e.id]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const value = text.trim();
    if (!value) return;
    markManual();
    setBusy(true);
    try {
      const s = await api<Suggestion>('/api/translate', { method: 'POST', body: { text: value, lang: r.lang, langName: r.langName } });
      useApp.setState((st) => ({ customReplies: { ...st.customReplies, [e.id]: s } }));
      setText('');
    } catch (err) {
      toast.error('Không dịch được', { description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {custom ? <SuggestionCard s={custom} index="custom" lang={r.lang} eventId={e.id} /> : null}
      <form onSubmit={submit} className="rounded-2xl bg-ink-850 p-3 ring-1 ring-inset ring-ink-800">
        <label htmlFor="custom-reply" className="mb-2 flex items-center gap-1.5 px-1 text-[13px] font-medium text-ink-400">
          <Translate size={15} />
          Tự soạn bằng tiếng Việt, dịch sang {langName(r.lang, r.langName)}
        </label>
        <div className="flex gap-2">
          <input
            id="custom-reply"
            value={text}
            onChange={(ev) => setText(ev.target.value)}
            onFocus={markManual}
            placeholder="Ví dụ: Mình ở Hà Nội, cảm ơn bạn nhé"
            autoComplete="off"
            className="h-11 min-w-0 flex-1 rounded-xl bg-ink-900 px-3.5 text-[15px] text-ink-50 ring-1 ring-inset ring-ink-700 outline-none placeholder:text-ink-500 focus:ring-2 focus:ring-brand-500"
          />
          <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!text.trim()} aria-label="Dịch">
            {busy ? null : <PaperPlaneRight size={18} weight="fill" />}
            <span className="hidden sm:inline">Dịch</span>
          </Button>
        </div>
      </form>
    </div>
  );
}

function OriginalComment({ e }: { e: ChatEvent }) {
  const r = e.analysis.result;
  const foreign = isForeign(e);
  return (
    <div className="rounded-2xl bg-ink-850 p-4 ring-1 ring-inset ring-ink-800 sm:p-5">
      <div className="flex items-center gap-2.5">
        <Avatar id={e.user.id} name={e.user.name} src={e.user.avatar} size="sm" />
        <span className="min-w-0 truncate text-sm font-medium text-ink-300">{e.user.name}</span>
        <span className="font-mono text-xs text-ink-500 tabular">{fmtTime(e.ts)}</span>
        {foreign && r ? <span className="ml-auto shrink-0 rounded-md bg-foreign/10 px-2 py-0.5 text-xs font-semibold text-foreign">{langName(r.lang, r.langName)}</span> : null}
      </div>
      <p className="mt-3 text-[20px] leading-snug font-semibold break-words text-ink-50">{e.text}</p>
      {foreign && r?.commentPhonetic ? <p className="mt-1.5 text-sm text-ink-400 italic">Đọc là: {r.commentPhonetic}</p> : null}
      {foreign && r?.translation ? (
        <p className="mt-3 border-t border-ink-700/60 pt-3 text-[18px] leading-snug font-medium text-foreign">{r.translation}</p>
      ) : null}
      {foreign && r ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <ListenButton e={e} />
          <ReanalyzeButton e={e} />
        </div>
      ) : null}
    </div>
  );
}

function ListenButton({ e }: { e: ChatEvent }) {
  const key = `${e.id}:original`;
  const playing = useAudio((s) => s.playingKey === key);
  return (
    <Button size="sm" variant="secondary" onClick={() => speakNow(key, e.text, e.analysis.result!.lang)}>
      {playing ? <Stop size={14} weight="fill" /> : <SpeakerSimpleHigh size={14} weight="fill" />}
      Nghe bình luận
    </Button>
  );
}

function ReanalyzeButton({ e }: { e: ChatEvent }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => {
        markManual();
        live.analyze(e.id, true).catch((err) => toast.error(errorMessage(err)));
      }}
    >
      <ArrowsClockwise size={14} weight="bold" />
      Gợi ý khác
    </Button>
  );
}

export function ReplyPanel({ onClose }: { onClose?: () => void }) {
  const selectedId = useApp((s) => s.selectedId);
  const e = useApp((s) => s.events.find((x) => x.id === s.selectedId));
  const autoFollow = useApp((s) => s.autoFollow);
  const requested = useRef<string | null>(null);

  const chat = e?.kind === 'chat' ? e : undefined;

  // Chế độ thủ công / comment chưa phân tích: tự gọi phân tích khi được chọn
  useEffect(() => {
    if (!chat) return;
    const a = chat.analysis;
    const needs = a.status === 'none' || (a.status === 'skipped' && !a.result && /\p{L}/u.test(chat.text));
    if (needs && requested.current !== chat.id) {
      requested.current = chat.id;
      live.analyze(chat.id).catch((err) => toast.error(errorMessage(err)));
    }
  }, [chat]);

  // Phím tắt 1/2/3 để phát gợi ý, Esc để đóng
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || ev.metaKey || ev.ctrlKey) return;
      if (ev.key === 'Escape') onClose?.();
      if (!chat || !isForeign(chat)) return;
      const n = Number(ev.key);
      const s = chat.analysis.result!.suggestions[n - 1];
      if (s) {
        ev.preventDefault();
        markManual();
        speakNow(`${chat.id}:${n - 1}`, s.text, chat.analysis.result!.lang);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chat, onClose]);

  let body;
  if (!selectedId || !chat) {
    body = (
      <EmptyState icon={<Lightbulb size={26} />} title="Chọn một bình luận để trả lời">
        Bình luận nước ngoài có vạch xanh bên trái. Bấm vào để xem bản dịch và 3 câu trả lời kèm phiên âm tiếng Việt.
        <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 text-xs text-ink-500">
          Phím tắt: <Kbd>1</Kbd> <Kbd>2</Kbd> <Kbd>3</Kbd> phát gợi ý
        </div>
      </EmptyState>
    );
  } else {
    const a = chat.analysis;
    const r = a.result;
    body = (
      <div className="space-y-3">
        <OriginalComment e={chat} />
        {a.status === 'pending' || a.status === 'none' ? (
          <SuggestionSkeleton />
        ) : a.status === 'error' ? (
          <div className="flex items-start gap-3 rounded-2xl bg-brand-700/10 p-4 ring-1 ring-inset ring-brand-700/30">
            <Warning size={20} weight="fill" className="mt-0.5 shrink-0 text-brand-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink-100">Không tạo được gợi ý</p>
              <p className="mt-0.5 text-[13px] break-words text-ink-400">{a.error}</p>
            </div>
            <ReanalyzeButton e={chat} />
          </div>
        ) : !r || r.isVietnamese ? (
          <p className="rounded-2xl bg-ink-850 px-4 py-6 text-center text-sm text-ink-400 ring-1 ring-inset ring-ink-800">Bình luận tiếng Việt, bạn trả lời trực tiếp nhé.</p>
        ) : (
          <>
            {r.suggestions.map((s, i) => (
              <SuggestionCard key={`${chat.id}-${i}-${s.text}`} s={s} index={i} lang={r.lang} eventId={chat.id} />
            ))}
            <CustomReply e={chat} />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex min-h-14 items-center gap-3 border-b border-ink-800 px-4 py-2.5">
        <h2 className="flex-1 text-[15px] font-semibold tracking-tight">Trả lời</h2>
        <label className="hidden cursor-pointer items-center gap-2 text-[13px] text-ink-400 select-none lg:flex" title="Tự chuyển sang bình luận nước ngoài mới nhất (tạm dừng 15 giây sau khi bạn tự chọn)">
          <input type="checkbox" checked={autoFollow} onChange={(ev) => setAutoFollow(ev.target.checked)} className="size-4 accent-brand-500" />
          Tự nhảy tới bình luận mới
        </label>
        {onClose ? (
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Đóng">
            <X size={18} weight="bold" />
          </Button>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">{body}</div>
    </div>
  );
}
