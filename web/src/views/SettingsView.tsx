import { DeviceMobile, Gift, Translate, Lightning, Play, ShareFat, SpeakerHigh, UserPlus } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button, cx, Panel, PanelHeader, Toggle } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { setVolume, speakNow, useAudio } from '../lib/audio';
import { useApp } from '../lib/store';
import type { Settings } from '../lib/types';
import { isPresetTemplate, TEMPLATE_VARS, templateFromDisplay, templateToDisplay, THANK_PRESETS, thankPreset, type TemplateVar } from '@shared/thanks';

function useSettingsSaver() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Partial<Settings>>({});

  return (patch: Partial<Settings>, delay = 0) => {
    useApp.setState((s) => ({ settings: s.settings ? { ...s.settings, ...patch } : s.settings }));
    pending.current = { ...pending.current, ...patch };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const body = pending.current;
      pending.current = {};
      try {
        const saved = await api<Settings>('/api/settings', { method: 'PUT', body });
        useApp.setState({ settings: saved });
      } catch (err) {
        toast.error('Không lưu được cài đặt', { description: errorMessage(err) });
      }
    }, delay);
  };
}

function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block py-3">
      <span className="block text-sm font-medium text-ink-100">{label}</span>
      {hint ? <span className="mt-0.5 block text-[13px] text-ink-400">{hint}</span> : null}
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

const inputCls =
  'h-11 w-full rounded-xl bg-ink-850 px-3.5 text-[15px] text-ink-50 ring-1 ring-inset ring-ink-700 outline-none placeholder:text-ink-500 focus:ring-2 focus:ring-brand-500';

/** Đang mở qua localhost hoặc IP mạng nội bộ (chạy trên máy cá nhân), không phải bản deploy */
const RUNNING_LOCALLY = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname);

const sample = (lang: string) => ({ name: 'Minh Anh', count: '5', gift: lang === 'vi' ? 'bông hồng' : 'Rose' });

function preview(template: string, vars: Record<string, string>) {
  return templateFromDisplay(template).replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

function TemplateField({
  value,
  onChange,
  label,
  vars,
  disabled,
  lang,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  vars: TemplateVar[];
  disabled: boolean;
  lang: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [local, setLocal] = useState(() => templateToDisplay(value));
  useEffect(() => {
    // Chỉ cập nhật khi giá trị đã lưu khác với đang gõ (vd: đổi ngôn ngữ), để không nhảy con trỏ
    setLocal((cur) => (templateFromDisplay(cur) === value ? cur : templateToDisplay(value)));
  }, [value]);
  const text = preview(local, sample(lang));

  function update(next: string) {
    setLocal(next);
    onChange(templateFromDisplay(next));
  }

  /** Chèn biến vào đúng chỗ con trỏ đang đứng */
  function insert(v: TemplateVar) {
    const el = inputRef.current;
    const token = `{${TEMPLATE_VARS[v].label}}`;
    const start = el?.selectionStart ?? local.length;
    const end = el?.selectionEnd ?? local.length;
    const before = local.slice(0, start);
    const after = local.slice(end);
    const pad = before && !/\s$/.test(before) ? ' ' : '';
    const padAfter = !/^[\s!?.,]/.test(after) ? ' ' : '';
    update(before + pad + token + padAfter + after);
    const caret = (before + pad + token + padAfter).length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  }

  return (
    <div className={cx('pb-3 transition-opacity', disabled && 'pointer-events-none opacity-40')}>
      <span className="sr-only">{label}</span>
      <div className="flex gap-2">
        <input ref={inputRef} aria-label={label} value={local} onChange={(e) => update(e.target.value)} className={inputCls} />
        <Button variant="secondary" size="lg" onClick={() => speakNow(`preview:${label}`, text, lang)} aria-label="Nghe thử" title="Nghe thử">
          <Play size={16} weight="fill" />
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
        Bấm để chèn:
        {vars.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => insert(v)}
            title={`Chèn ${TEMPLATE_VARS[v].hint.toLowerCase()} vào câu`}
            className="pressable rounded-md bg-ink-800 px-2 py-1 font-medium text-ink-200 ring-1 ring-inset ring-ink-700 hover:bg-ink-700"
          >
            + {TEMPLATE_VARS[v].hint}
          </button>
        ))}
      </div>
      <div className="mt-1.5 text-xs text-ink-400">
        Sẽ đọc: <span className="text-ink-200">“{text}”</span>
      </div>
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; hint: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'pressable rounded-xl p-3.5 text-left ring-1 ring-inset',
            value === o.value ? 'bg-brand-500/10 ring-brand-500/60' : 'bg-ink-850 ring-ink-700 hover:ring-ink-600',
          )}
        >
          <span className="block text-sm font-semibold text-ink-100">{o.label}</span>
          <span className="mt-0.5 block text-[13px] leading-snug text-ink-400">{o.hint}</span>
        </button>
      ))}
    </div>
  );
}

export function SettingsView() {
  const settings = useApp((s) => s.settings);
  const save = useSettingsSaver();
  const volume = useAudio((s) => s.volume);
  const [channel, setChannel] = useState(settings?.channelInfo ?? '');
  useEffect(() => setChannel(settings?.channelInfo ?? ''), [settings?.channelInfo]);

  /** Đổi ngôn ngữ: câu mẫu chưa sửa thì tự đổi theo; câu đã tự sửa thì hỏi trước khi thay */
  function changeThankLang(lang: string) {
    if (!settings) return;
    const p = thankPreset(lang);
    const fields = [
      ['giftTemplate', 'gift'],
      ['followTemplate', 'follow'],
      ['shareTemplate', 'share'],
    ] as const;
    const custom = fields.filter(([key, kind]) => !isPresetTemplate(kind, settings[key]));
    const replaceCustom = custom.length > 0 && confirm(`Bạn đã tự sửa ${custom.length} câu cảm ơn. Thay bằng câu mẫu ${p.label}?`);
    const patch: Partial<Settings> = { thankLang: lang };
    for (const [key, kind] of fields) {
      if (replaceCustom || isPresetTemplate(kind, settings[key])) patch[key] = p[kind];
    }
    save(patch);
  }

  if (!settings) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-40 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl items-start gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Panel>
          <PanelHeader title="Gợi ý trả lời" icon={<Lightning size={18} />} />
          <div className="space-y-1 px-4 py-3">
            <Segmented
              value={settings.suggestMode}
              onChange={(v) => save({ suggestMode: v })}
              options={[
                { value: 'auto', label: 'Tự động', hint: 'Dịch và gợi ý ngay khi có bình luận nước ngoài.' },
                { value: 'manual', label: 'Khi bấm chọn', hint: 'Chỉ gọi AI khi bạn bấm vào bình luận, tiết kiệm lượt gọi.' },
              ]}
            />
            <Field label="Giới thiệu về bạn" hint="AI dùng thông tin này để trả lời khi người xem hỏi về bạn (quê, tuổi, sở thích, lịch live…).">
              <textarea
                value={channel}
                onChange={(e) => {
                  setChannel(e.target.value);
                  save({ channelInfo: e.target.value }, 600);
                }}
                rows={4}
                placeholder="Ví dụ: Mình tên Hà, 24 tuổi, ở Đà Nẵng. Live hát mỗi tối 9h."
                className={cx(inputCls, 'h-auto resize-y py-3 leading-relaxed')}
              />
            </Field>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Âm thanh trên thiết bị này" icon={<SpeakerHigh size={18} />} />
          <div className="px-4 py-3">
            <Field label="Âm lượng giọng đọc" hint="Đặt máy gần iPhone đang live để micro thu được tiếng.">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="h-2 flex-1 accent-brand-500"
                  aria-label="Âm lượng"
                />
                <span className="w-10 text-right font-mono text-sm text-ink-300 tabular">{Math.round(volume * 100)}%</span>
                <Button size="sm" onClick={() => speakNow('preview:volume', thankPreset(settings.thankLang).hello, settings.thankLang)}>
                  <Play size={14} weight="fill" />
                  Thử
                </Button>
              </div>
            </Field>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Dùng trên điện thoại" icon={<DeviceMobile size={18} />} />
          <ol className="list-decimal space-y-1.5 py-4 pr-4 pl-9 text-sm leading-relaxed text-ink-300 marker:text-ink-500">
            {RUNNING_LOCALLY ? (
              <>
                <li>Kết nối điện thoại hoặc iPad vào cùng Wi-Fi với máy tính đang chạy TikCom.</li>
                <li>Mở địa chỉ “Thiết bị cùng Wi-Fi” hiện trong cửa sổ terminal.</li>
              </>
            ) : (
              <li>
                Mở <span className="font-medium text-ink-100">{location.host}</span> trên điện thoại hoặc iPad (dùng Wi-Fi hay 4G đều được) rồi đăng nhập.
              </li>
            )}
            <li>Safari: bấm Chia sẻ → Thêm vào Màn hình chính để mở như ứng dụng.</li>
            <li>Bấm “Bật âm thanh” một lần mỗi khi mở lại trang.</li>
          </ol>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Tự động cảm ơn bằng giọng nói" icon={<Gift size={18} />} />
        <div className="divide-y divide-ink-800 px-4">
          <label className="flex items-center justify-between gap-3 py-3.5">
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-100">
                <Translate size={15} /> Ngôn ngữ giọng đọc
              </span>
              <span className="mt-0.5 block text-[13px] leading-snug text-ink-400">Đổi ngôn ngữ sẽ đổi luôn các câu mẫu bên dưới.</span>
            </span>
            <select
              value={settings.thankLang}
              onChange={(e) => changeThankLang(e.target.value)}
              className="h-10 shrink-0 rounded-xl bg-ink-850 px-3 text-sm text-ink-50 ring-1 ring-inset ring-ink-700 outline-none focus:ring-2 focus:ring-brand-500"
            >
              {THANK_PRESETS.map((p) => (
                <option key={p.lang} value={p.lang}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <div>
            <Toggle checked={settings.thankGifts} onChange={(v) => save({ thankGifts: v })} label="Cảm ơn khi được tặng quà" description="Đọc sau khi combo quà kết thúc." />
            <div className={cx('pb-3', !settings.thankGifts && 'pointer-events-none opacity-40')}>
              <label className="flex items-center justify-between gap-3 pb-3 text-[13px] text-ink-400">
                Chỉ cảm ơn quà từ
                <span className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={settings.minDiamonds}
                    onChange={(e) => save({ minDiamonds: Math.max(0, Number(e.target.value) || 0) }, 500)}
                    className="h-9 w-20 rounded-lg bg-ink-850 px-2.5 text-right font-mono text-sm text-ink-50 ring-1 ring-inset ring-ink-700 outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  kim cương
                </span>
              </label>
            </div>
            <TemplateField
              label="Câu cảm ơn quà"
              value={settings.giftTemplate}
              onChange={(v) => save({ giftTemplate: v }, 600)}
              vars={['name', 'count', 'gift']}
              disabled={!settings.thankGifts}
              lang={settings.thankLang}
            />
          </div>
          <div>
            <Toggle
              checked={settings.thankFollows}
              onChange={(v) => save({ thankFollows: v })}
              label={
                <span className="flex items-center gap-1.5">
                  <UserPlus size={15} /> Cảm ơn khi có người theo dõi
                </span>
              }
            />
            <TemplateField
              label="Câu cảm ơn theo dõi"
              value={settings.followTemplate}
              onChange={(v) => save({ followTemplate: v }, 600)}
              vars={['name']}
              disabled={!settings.thankFollows}
              lang={settings.thankLang}
            />
          </div>
          <div>
            <Toggle
              checked={settings.thankShares}
              onChange={(v) => save({ thankShares: v })}
              label={
                <span className="flex items-center gap-1.5">
                  <ShareFat size={15} /> Cảm ơn khi có người chia sẻ
                </span>
              }
            />
            <TemplateField
              label="Câu cảm ơn chia sẻ"
              value={settings.shareTemplate}
              onChange={(v) => save({ shareTemplate: v }, 600)}
              vars={['name']}
              disabled={!settings.thankShares}
              lang={settings.thankLang}
            />
          </div>
        </div>
      </Panel>
    </div>
  );
}
