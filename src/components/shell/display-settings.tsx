'use client';

import { useDisplaySettings } from '@/hooks/use-display-settings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function DisplaySettingsSection() {
  const { settings, updateSettings } = useDisplaySettings();
  return <Card className="mb-6">
    <CardHeader><CardTitle>表示</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <fieldset className="flex flex-wrap gap-4"><legend className="mb-2 text-slate-400">騰落色</legend>
        <label className="flex items-center gap-2"><input type="radio" name="pm-updown" value="jp" checked={settings.updown === 'jp'} onChange={() => updateSettings({ updown: 'jp' })} />日本式（上昇：赤／下落：青）</label>
        <label className="flex items-center gap-2"><input type="radio" name="pm-updown" value="us" checked={settings.updown === 'us'} onChange={() => updateSettings({ updown: 'us' })} />米国式（上昇：緑／下落：赤）</label>
      </fieldset>
      <fieldset className="flex flex-wrap gap-4"><legend className="mb-2 text-slate-400">行の高さ</legend>
        <label className="flex items-center gap-2"><input type="radio" name="pm-density" value="compact" checked={settings.density === 'compact'} onChange={() => updateSettings({ density: 'compact' })} />コンパクト（24px）</label>
        <label className="flex items-center gap-2"><input type="radio" name="pm-density" value="standard" checked={settings.density === 'standard'} onChange={() => updateSettings({ density: 'standard' })} />標準（32px）</label>
      </fieldset>
    </CardContent>
  </Card>;
}
