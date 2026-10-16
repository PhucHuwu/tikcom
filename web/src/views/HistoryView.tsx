import { ArrowsClockwise, CaretLeft, ChatsCircle, ClockCounterClockwise, Crown, Diamond, Flask, Gift, Globe, Trash } from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { RankList, TimelineChart } from '../components/charts';
import { Button, cx, EmptyState, Panel, PanelHeader, Spinner, Stat } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { fmt, fmtCompact, fmtDateTime, fmtDuration, langName } from '../lib/format';
import type { SessionDetail, SessionSummary } from '../lib/types';

function SessionRow({ s, active, onClick }: { s: SessionSummary; active: boolean; onClick: () => void }) {
  const live = !s.endedAt;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active}
      className={cx('w-full rounded-xl px-3.5 py-3 text-left transition-colors', active ? 'bg-ink-800 ring-1 ring-inset ring-ink-700' : 'hover:bg-ink-850')}
    >
      <div className="flex items-center gap-2">
        {s.demo ? <Flask size={14} className="text-ink-500" /> : null}
        <span className="truncate text-sm font-semibold text-ink-100">{s.demo ? 'Demo' : `@${s.username}`}</span>
        {live ? <span className="rounded bg-live/15 px-1.5 py-px text-[11px] font-semibold text-live">đang live</span> : null}
        <span className="ml-auto shrink-0 font-mono text-xs text-ink-500 tabular">{fmtDuration((s.endedAt ?? Date.now()) - s.startedAt)}</span>
      </div>
      <div className="mt-0.5 text-xs text-ink-400">{fmtDateTime(s.startedAt)}</div>
      <div className="mt-2 flex gap-4 font-mono text-xs text-ink-300 tabular">
        <span className="flex items-center gap-1">
          <ChatsCircle size={13} /> {fmtCompact(s.comments)}
        </span>
        <span className="flex items-center gap-1">
          <Diamond size={13} className="text-gold" /> {fmtCompact(s.diamonds)}
        </span>
        <span className="flex items-center gap-1 text-ink-400">đỉnh {fmtCompact(s.peakViewers)} xem</span>
      </div>
    </button>
  );
}

function Detail({ d, onDelete, onBack }: { d: SessionDetail; onDelete: () => void; onBack: () => void }) {
  const s = d.summary;
  const rank = <T,>(rows: T[], name: (r: T) => string, value: (r: T) => number) => rows.map((r) => ({ name: name(r), value: value(r) }));

  return (
    <Panel className="min-w-0">
      <header className="flex min-h-14 items-center gap-2 border-b border-ink-800 px-3 py-2.5 sm:px-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="lg:hidden" aria-label="Quay lại danh sách">
          <CaretLeft size={16} weight="bold" />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold">{s.demo ? 'Buổi demo' : `@${s.username}`}</h2>
          <p className="text-xs text-ink-400">{fmtDateTime(s.startedAt)}</p>
        </div>
        <Button variant="danger" size="sm" onClick={onDelete}>
          <Trash size={14} weight="bold" />
          Xóa
        </Button>
      </header>
      <div className="grid grid-cols-2 gap-2.5 p-4 sm:grid-cols-3 xl:grid-cols-5">
        <Stat label="Thời lượng" value={fmtDuration((s.endedAt ?? Date.now()) - s.startedAt)} />
        <Stat label="Người xem cao nhất" value={fmt(s.peakViewers)} />
        <Stat label="Bình luận" value={fmt(s.comments)} hint={`${fmt(s.commenters)} người`} />
        <Stat label="Kim cương" value={fmt(s.diamonds)} hint={`${fmt(s.gifts)} món quà`} />
        <Stat label="Lượt thích" value={fmt(s.totalLikes)} />
        <Stat label="Theo dõi mới" value={fmt(s.follows)} />
        <Stat label="Chia sẻ" value={fmt(s.shares)} />
        <Stat label="Lượt vào phòng" value={fmt(s.joins)} />
      </div>
      <div className="border-t border-ink-800">
        <TimelineChart points={d.timeline.map((t) => ({ minute: Number(t.minute), comments: Number(t.comments), diamonds: Number(t.diamonds) }))} />
      </div>
      <div className="grid border-t border-ink-800 md:grid-cols-2">
        <div className="md:border-r md:border-ink-800">
          <h3 className="flex items-center gap-2 px-4 pt-4 text-[13px] font-semibold text-ink-400">
            <Crown size={15} /> Tặng quà nhiều nhất
          </h3>
          <RankList items={rank(d.topGifters, (r) => r.name, (r) => Number(r.diamonds))} unit={<Diamond size={12} weight="fill" className="text-gold" />} empty="Không có quà" />
        </div>
        <div>
          <h3 className="flex items-center gap-2 px-4 pt-4 text-[13px] font-semibold text-ink-400">
            <ChatsCircle size={15} /> Bình luận nhiều nhất
          </h3>
          <RankList items={rank(d.topCommenters, (r) => r.name, (r) => Number(r.comments))} empty="Không có bình luận" />
        </div>
        <div className="border-t border-ink-800 md:border-r">
          <h3 className="flex items-center gap-2 px-4 pt-4 text-[13px] font-semibold text-ink-400">
            <Gift size={15} /> Loại quà
          </h3>
          <RankList items={rank(d.giftTypes, (r) => r.name, (r) => Number(r.diamonds))} unit={<Diamond size={12} weight="fill" className="text-gold" />} empty="Không có quà" />
        </div>
        <div className="border-t border-ink-800">
          <h3 className="flex items-center gap-2 px-4 pt-4 text-[13px] font-semibold text-ink-400">
            <Globe size={15} /> Ngôn ngữ
          </h3>
          <RankList items={rank(d.languages, (r) => langName(r.lang), (r) => Number(r.count))} bars empty="Không có dữ liệu" />
        </div>
      </div>
    </Panel>
  );
}

export function HistoryView() {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const load = useCallback(async () => {
    try {
      setSessions(await api<SessionSummary[]>('/api/sessions'));
    } catch (err) {
      toast.error(errorMessage(err));
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function open(id: number) {
    setActiveId(id);
    setLoadingDetail(true);
    try {
      setDetail(await api<SessionDetail>(`/api/sessions/${id}`));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoadingDetail(false);
    }
  }

  async function remove(id: number) {
    if (!confirm('Xóa buổi live này khỏi lịch sử? Không thể hoàn tác.')) return;
    try {
      await api(`/api/sessions/${id}`, { method: 'DELETE' });
      toast.success('Đã xóa buổi live');
      setDetail(null);
      setActiveId(null);
      void load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const showDetail = activeId !== null;

  return (
    <div className="mx-auto grid max-w-[1400px] items-start gap-4 lg:grid-cols-[360px_1fr]">
      <Panel className={cx('min-w-0', showDetail && 'hidden lg:block')}>
        <PanelHeader title="Các buổi live" icon={<ClockCounterClockwise size={18} />}>
          <Button variant="ghost" size="sm" onClick={load} aria-label="Làm mới">
            <ArrowsClockwise size={16} weight="bold" />
          </Button>
        </PanelHeader>
        <div className="max-h-[calc(100dvh-14rem)] space-y-1 overflow-y-auto p-2">
          {sessions === null ? (
            <div className="space-y-2 p-1">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-[74px] rounded-xl" />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <EmptyState icon={<ClockCounterClockwise size={26} />} title="Chưa có buổi live nào">
              Mỗi lần bạn kết nối, TikCom sẽ tự lưu lại số liệu ở đây.
            </EmptyState>
          ) : (
            sessions.map((s) => <SessionRow key={s.id} s={s} active={s.id === activeId} onClick={() => open(s.id)} />)
          )}
        </div>
      </Panel>

      <div className={cx('min-w-0', !showDetail && 'hidden lg:block')}>
        {loadingDetail && !detail ? (
          <Panel className="grid h-64 place-items-center">
            <Spinner className="size-6 text-ink-400" />
          </Panel>
        ) : detail ? (
          <Detail d={detail} onDelete={() => remove(detail.summary.id)} onBack={() => setActiveId(null)} />
        ) : (
          <Panel>
            <EmptyState icon={<ChartBarIcon />} title="Chọn một buổi live">
              Xem lại số người xem, bình luận, quà và ngôn ngữ của từng buổi.
            </EmptyState>
          </Panel>
        )}
      </div>
    </div>
  );
}

function ChartBarIcon() {
  return <Diamond size={26} />;
}
