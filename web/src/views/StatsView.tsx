import { ChartLineUp, ChatsCircle, Crown, Diamond, Globe } from '@phosphor-icons/react';
import { RankList, TimelineChart } from '../components/charts';
import { EmptyState, Panel, PanelHeader, Stat } from '../components/ui';
import { fmt, fmtDuration, langName } from '../lib/format';
import { useApp } from '../lib/store';

export function StatsView() {
  const s = useApp((st) => st.stats);
  const status = useApp((st) => st.status);

  if (!s || !s.startedAt) {
    return (
      <Panel className="mx-auto max-w-2xl">
        <EmptyState icon={<ChartLineUp size={26} />} title="Chưa có số liệu">
          Thống kê sẽ chạy theo thời gian thực sau khi bạn kết nối buổi live. Các buổi đã kết thúc nằm trong tab Lịch sử.
        </EmptyState>
      </Panel>
    );
  }

  const minutes = Math.max(1, (Date.now() - s.startedAt) / 60000);

  return (
    <div className="mx-auto grid max-w-[1400px] gap-4 lg:grid-cols-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:col-span-3 lg:grid-cols-6">
        <Stat label="Thời lượng" value={fmtDuration(Date.now() - s.startedAt)} hint={status.state === 'idle' ? 'đã kết thúc' : 'đang live'} />
        <Stat label="Người xem cao nhất" value={fmt(s.peakViewers)} hint={`hiện tại ${fmt(s.viewers)}`} />
        <Stat label="Bình luận" value={fmt(s.comments)} hint={`${(s.comments / minutes).toFixed(1)} mỗi phút`} />
        <Stat label="Người bình luận" value={fmt(s.commenters)} hint={`${fmt(s.foreignComments)} bình luận nước ngoài`} />
        <Stat label="Kim cương" value={fmt(s.diamonds)} hint={`${fmt(s.gifts)} món quà`} />
        <Stat label="Theo dõi mới" value={fmt(s.follows)} hint={`${fmt(s.shares)} lượt chia sẻ`} />
      </div>

      <Panel className="lg:col-span-3">
        <PanelHeader title="Diễn biến theo phút" icon={<ChartLineUp size={18} />} />
        <TimelineChart points={s.timeline} />
      </Panel>

      <Panel>
        <PanelHeader title="Tặng quà nhiều nhất" icon={<Crown size={18} />} />
        <RankList items={s.topGifters} unit={<Diamond size={12} weight="fill" className="text-gold" />} empty="Chưa có ai tặng quà" />
      </Panel>
      <Panel>
        <PanelHeader title="Bình luận nhiều nhất" icon={<ChatsCircle size={18} />} />
        <RankList items={s.topCommenters} empty="Chưa có bình luận" />
      </Panel>
      <Panel>
        <PanelHeader title="Ngôn ngữ người xem" icon={<Globe size={18} />} />
        <RankList items={s.languages.map((l) => ({ ...l, name: langName('', l.name) }))} bars empty="Chưa nhận diện ngôn ngữ nào" />
      </Panel>
    </div>
  );
}
