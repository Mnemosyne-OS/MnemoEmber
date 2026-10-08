/**
 * MemoryCard — the one switch that lets the chat read Ember's log (doc 139 §3).
 *
 * It says exactly where things are: off (nothing written), written but not
 * read yet (the sandbox is walled until the person unlocks its permanence in
 * the vault panel), read by the chat, or the last write's error. "Forget what
 * was written" asks twice, with the count, because it cannot be undone.
 * Its outcome has its own line, shown even after "Stop writing": a refusal
 * says the entries are still there, a success says how many the vault forgot
 * (no number when the vault did not say one).
 */
import { useState } from 'react';
import { useI18n } from '../i18n/useI18n';
import { formatClock } from '../lib/format';
import { forgetAll, syncNow, turnOff, turnOn, useSyncState } from '../lib/memorySync';
import type { MemoryMeta } from '../lib/types';

export function MemoryCard({ memory }: { memory: MemoryMeta }) {
  const { t } = useI18n();
  const sync = useSyncState();
  const [confirming, setConfirming] = useState(false);
  const written = Object.keys(memory.days).length + (memory.statusId !== null ? 1 : 0) + memory.staleStatusIds.length;

  let line: string;
  let tone = '';
  if (!memory.on) line = t('memory.offText');
  else if (sync.phase === 'writing') line = t('memory.writing');
  else if (sync.phase === 'error') { line = t('memory.error', { reason: sync.error ?? '' }); tone = 'em-memory-bad'; }
  else if (sync.unlocked === false) { line = t('memory.walled', { vault: sync.vault ?? '' }); tone = 'em-memory-warn'; }
  else if (sync.unlocked === true) { line = t('memory.read'); tone = 'em-memory-good'; }
  else line = t('memory.writing');

  let forgetLine: string | null = null;
  if (sync.forget.kind === 'refused') forgetLine = t('memory.forgetRefused', { n: written, reason: sync.forget.error });
  else if (sync.forget.kind === 'done') {
    forgetLine = sync.forget.forgotten === null ? t('memory.forgottenUnknown') : t('memory.forgotten', { n: sync.forget.forgotten });
  }

  return (
    <section className="em-card em-memory">
      <header className="em-card-head">
        <h2 className="em-h2">{t('memory.title')}</h2>
        {memory.on && memory.lastWrittenAt !== null && (
          <span className="em-trend">{t('memory.lastWritten', { time: formatClock(memory.lastWrittenAt) })}</span>
        )}
      </header>
      {forgetLine !== null && (
        <p className={`em-memory-line ${sync.forget.kind === 'refused' ? 'em-memory-bad' : ''}`}>{forgetLine}</p>
      )}
      <p className={`em-memory-line ${tone}`}>{line}</p>
      <div className="em-memory-actions">
        {!memory.on ? (
          <button type="button" className="em-btn em-btn-calm" onClick={() => turnOn()}>{t('memory.turnOn')}</button>
        ) : (
          <>
            {sync.phase === 'error' && <button type="button" className="em-btn em-btn-calm" onClick={() => void syncNow()}>{t('memory.retry')}</button>}
            <button type="button" className="em-ghost" onClick={() => turnOff()}>{t('memory.turnOff')}</button>
          </>
        )}
        {written > 0 && (confirming ? (
          <>
            <span className="em-muted">{t('memory.forgetQ', { n: written })}</span>
            <button type="button" className="em-ghost em-ghost-bad" onClick={() => { setConfirming(false); void forgetAll(); }}>{t('memory.forgetYes')}</button>
            <button type="button" className="em-ghost" onClick={() => setConfirming(false)}>{t('log.cancel')}</button>
          </>
        ) : (
          <button type="button" className="em-ghost" onClick={() => setConfirming(true)}>{t('memory.forget')}</button>
        ))}
      </div>
    </section>
  );
}
