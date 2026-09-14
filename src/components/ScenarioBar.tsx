import type { ScenarioLibrary } from '../types'

type ScenarioBarProps = {
  library: ScenarioLibrary
  onSwitch: (id: string) => void
  onRename: (name: string) => void
  onSaveAs: () => void
  onNewExample: () => void
  onDelete: () => void
}

export function ScenarioBar({
  library,
  onSwitch,
  onRename,
  onSaveAs,
  onNewExample,
  onDelete,
}: ScenarioBarProps) {
  const active = library.scenarios.find((scenario) => scenario.id === library.activeId) ?? library.scenarios[0]
  const canDelete = library.scenarios.length > 1
  const ordered = [...library.scenarios].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
      <fieldset className="fieldset min-w-0 py-0">
        <legend className="fieldset-legend">Scenario</legend>
        <select
          className="select select-sm w-44 max-w-full"
          value={active.id}
          aria-label="Restore a saved scenario"
          onChange={(event) => onSwitch(event.target.value)}
        >
          {ordered.map((scenario) => (
            <option key={scenario.id} value={scenario.id}>
              {scenario.name.trim() || 'Untitled'}
            </option>
          ))}
        </select>
      </fieldset>
      <fieldset className="fieldset min-w-0 grow py-0">
        <legend className="fieldset-legend">Name</legend>
        <input
          className="input input-sm w-full min-w-40"
          value={active.name}
          maxLength={80}
          aria-label="Scenario name"
          onChange={(event) => onRename(event.target.value)}
          onBlur={() => onRename(active.name.trim() || 'Untitled')}
        />
      </fieldset>
      <div className="flex flex-wrap gap-1 pb-0.5">
        <button type="button" className="btn btn-primary btn-sm" onClick={onSaveAs}>
          Save as new
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={onNewExample}>
          New example
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm text-error"
          disabled={!canDelete}
          onClick={onDelete}
        >
          Delete
        </button>
      </div>
    </div>
  )
}
