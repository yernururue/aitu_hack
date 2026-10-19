"use client";

import { Button } from "@/components/ui/button";
import { PROFILE_IDS, type ProfileId } from "@/lib/contracts/request";
import { DEMO_PROFILE_DESCRIPTIONS, DEMO_PROFILE_LABELS } from "@/lib/profiles";
import type { DemoPreferences } from "@/lib/preferences";

export function ProfileSwitcher({ preferences, ready, onChange, onReset }: {
  preferences: DemoPreferences; ready: boolean; onChange: (profileId: ProfileId | null) => void; onReset: () => void;
}) {
  return <div className="form-section profile-section">
    <label className="field-label" htmlFor="demo-profile">Демо-профиль</label>
    <select id="demo-profile" value={preferences.profileId ?? ""} disabled={!ready} onChange={(event) => onChange(event.target.value ? event.target.value as ProfileId : null)} aria-describedby="demo-profile-description">
      <option value="">Без демо-профиля</option>
      {PROFILE_IDS.map((id) => <option key={id} value={id}>{DEMO_PROFILE_LABELS[id]}</option>)}
    </select>
    <p id="demo-profile-description" className="field-hint">{preferences.profileId ? DEMO_PROFILE_DESCRIPTIONS[preferences.profileId] : "Вы можете выбрать пример интересов для демонстрации."} Это не история ваших посещений. Явные условия поиска важнее.</p>
    <div className="local-history-counts"><span>Сохранено: {preferences.savedIds.length}</span><span>Скрыто: {preferences.dismissedIds.length}</span></div>
    <p className="field-hint">Профиль и выбранные ID хранятся только в этом браузере. Координаты и запросы в историю не записываются.</p>
    <Button variant="ghost" className="history-reset" disabled={!ready} onClick={onReset}>Сбросить демо-историю</Button>
  </div>;
}
