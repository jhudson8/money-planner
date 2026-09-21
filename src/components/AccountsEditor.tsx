import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { createEmptyLongTerm } from '../defaultPlan'
import { formatPercent, usd, yearsPhrase } from '../format'
import {
  alignHistoricalAccountStartYears,
  clampHistoricalStartYear,
  formatReturnPathSummary,
  getMarketPeriod,
  listResolvableMarketPeriods,
  maxHistoricalStartYear,
  minHistoricalStartYear,
  resolveMarketPeriod,
  resolveReturnPath,
  SP500_DATA_END,
  SP500_DATA_START,
} from '../marketHistory'
import { maskUsd, usePresentation } from '../presentation'
import { rmdStartAge } from '../rmd'
import {
  accountHasRmd,
  ageAtPlanYear,
  blendedReturnPercent,
  currentNetWorth,
  firstRmdByAccount,
  isRetirementAccount,
  isWalletAccount,
  labelForKind,
  openingWalletFunding,
  replenishableAccounts,
  replenishYears,
  yearsToProject,
  type FirstRmd,
} from '../simulation'
import { setLastSpSliderAccountId } from '../spSliderFocus'
import { NumberField } from './NumberField'
import type { AccountKind, Plan, Projection, SavingsAccount } from '../types'

type AccountsEditorProps = {
  plan: Plan
  projection: Projection
  onChange: (accounts: SavingsAccount[]) => void
}

export function AccountsEditor({ plan, projection, onChange }: AccountsEditorProps) {
  const presentation = usePresentation()
  const accounts = plan.accounts ?? []
  const [selectedId, setSelectedId] = useState<string | null>(
    () => accounts.find((a) => !isWalletAccount(a))?.id ?? accounts[0]?.id ?? null,
  )
  const [searchQuery, setSearchQuery] = useState('')

  const firstRmds = firstRmdByAccount(projection)
  const rmdStart = rmdStartAge(plan.birthDate)
  const ageToday = ageAtPlanYear(plan, 0)
  const lastAge =
    projection.points.at(-1)?.age ??
    (ageToday != null ? ageToday + yearsToProject(plan) : null)

  const wallet = accounts.find(isWalletAccount)
  const replenishable = replenishableAccounts(accounts).filter(
    (account) => account.kind !== 'shortTerm' && !isWalletAccount(account),
  )
  const longTerm = replenishable.filter((account) => !isRetirementAccount(account.kind))
  const retirement = replenishable.filter((account) => isRetirementAccount(account.kind))

  const funding = openingWalletFunding(plan)
  const total = currentNetWorth(plan)
  const simYears = yearsToProject(plan)
  const blended = blendedReturnPercent(accounts, simYears)
  const windowYears = replenishYears(plan)

  const activeAccount =
    accounts.find((a) => a.id === selectedId) ??
    accounts.find((a) => !isWalletAccount(a)) ??
    accounts[0] ??
    null

  useEffect(() => {
    if (activeAccount?.returnMode === 'historical') {
      setLastSpSliderAccountId(activeAccount.id)
    }
  }, [activeAccount?.id, activeAccount?.returnMode])

  function commit(next: SavingsAccount[]) {
    onChange(next)
  }

  function selectAccount(account: SavingsAccount) {
    setSelectedId(account.id)
    if (account.returnMode === 'historical') {
      setLastSpSliderAccountId(account.id)
    }
  }

  function update(id: string, next: SavingsAccount) {
    const previous = accounts.find((account) => account.id === id)
    const nextStart = next.historicalStartYear
    const changedStartYear =
      previous?.returnMode === 'historical' &&
      next.returnMode === 'historical' &&
      previous.historicalStartYear !== nextStart &&
      nextStart != null
    const updated = accounts.map((account) => (account.id === id ? next : account))
    commit(
      changedStartYear
        ? alignHistoricalAccountStartYears(updated, nextStart, simYears)
        : updated,
    )
    if (next.returnMode === 'historical') {
      setLastSpSliderAccountId(next.id)
    }
  }

  function applyOrder(longTermOrdered: SavingsAccount[], retirementOrdered: SavingsAccount[]) {
    const ordered = [...longTermOrdered, ...retirementOrdered]
    const orderById = new Map(ordered.map((account, index) => [account.id, index + 1]))
    commit(
      accounts.map((account) => {
        const order = orderById.get(account.id)
        return order == null ? account : { ...account, depletionOrder: order }
      }),
    )
  }

  function addLongTerm() {
    const next = createEmptyLongTerm(longTerm.length + 1)
    const withNew = [...accounts, next]
    const orderById = new Map(
      [...longTerm, next, ...retirement].map((account, index) => [account.id, index + 1]),
    )
    commit(
      withNew.map((account) => {
        const order = orderById.get(account.id)
        return order == null ? account : { ...account, depletionOrder: order }
      }),
    )
    selectAccount(next)
  }

  function removeAccount(id: string) {
    const nextAccounts = accounts.filter((item) => item.id !== id)
    commit(nextAccounts)
    if (selectedId === id) {
      const idx = accounts.findIndex((a) => a.id === id)
      const fallback = nextAccounts[idx] ?? nextAccounts[idx - 1] ?? nextAccounts[0] ?? null
      if (fallback) selectAccount(fallback)
      else setSelectedId(null)
    }
  }

  function moveInGroup(group: 'longTerm' | 'retirement', id: string, direction: -1 | 1) {
    const list = group === 'longTerm' ? longTerm : retirement
    const index = list.findIndex((account) => account.id === id)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= list.length) return
    const next = arrayMove(list, index, nextIndex)
    if (group === 'longTerm') applyOrder(next, retirement)
    else applyOrder(longTerm, next)
  }

  function reorderGroup(group: 'longTerm' | 'retirement', event: DragEndEvent) {
    const list = group === 'longTerm' ? longTerm : retirement
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = list.findIndex((account) => account.id === active.id)
    const newIndex = list.findIndex((account) => account.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const next = arrayMove(list, oldIndex, newIndex)
    if (group === 'longTerm') applyOrder(next, retirement)
    else applyOrder(longTerm, next)
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const query = searchQuery.toLowerCase().trim()
  const filterMatch = (a: SavingsAccount) =>
    !query ||
    a.name.toLowerCase().includes(query) ||
    kindLabel(a.kind).toLowerCase().includes(query)

  const filteredLongTerm = useMemo(() => longTerm.filter(filterMatch), [longTerm, query])
  const filteredRetirement = useMemo(() => retirement.filter(filterMatch), [retirement, query])
  const showWallet = wallet && (!query || wallet.name.toLowerCase().includes(query) || 'wallet'.includes(query))

  const totalVisible =
    (showWallet ? 1 : 0) + filteredLongTerm.length + filteredRetirement.length

  return (
    <div className="flex flex-col gap-5">
      {/* Top Banner / Stats */}
      <section className="card bg-base-100 shadow-sm border border-base-200">
        <div className="card-body p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold">Savings Accounts</h2>
                <span className="badge badge-primary font-medium">
                  {accounts.length} accounts
                </span>
                <span className="badge badge-ghost text-xs">
                  {longTerm.length} taxable · {retirement.length} retirement
                </span>
              </div>
              <p className="text-sm text-base-content/70">
                Life is paid from the short-term wallet, refilled from long-term and retirement
                accounts. Select an account to edit its balance, growth rate, and transfer settings.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-col items-start sm:items-end bg-base-200/60 rounded-box px-3.5 py-1.5 border border-base-300/50">
                <span className="text-[11px] uppercase tracking-wider font-semibold text-base-content/60">
                  Total Savings Today
                </span>
                <div className="flex items-baseline gap-1.5 font-semibold text-lg tabular-nums">
                  <span className="text-primary font-bold">
                    {maskUsd(total, presentation, usd)}
                  </span>
                  <span className="text-xs font-normal text-base-content/60">
                    · {presentation ? '•••' : formatPercent(blended, 2)}/yr combined
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-primary btn-sm gap-1.5"
                onClick={addLongTerm}
              >
                <PlusIcon />
                Add long-term
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Master / Details Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Sub-Nav (Master List) */}
        <aside className="lg:col-span-5 xl:col-span-4 flex flex-col gap-3">
          <div className="card bg-base-100 shadow-sm border border-base-200">
            <div className="card-body p-3 sm:p-4 gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-base-content/60">
                  Accounts ({accounts.length})
                </span>
                <span className="text-xs text-base-content/50">
                  Select an account to view or edit
                </span>
              </div>

              {accounts.length > 3 ? (
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Filter accounts..."
                    className="input input-sm input-bordered w-full pr-8 text-xs"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      className="absolute right-2 top-1.5 text-xs text-base-content/50 hover:text-base-content"
                      onClick={() => setSearchQuery('')}
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
              ) : null}

              {totalVisible === 0 ? (
                <div className="text-center py-6 text-sm text-base-content/60">
                  No accounts match &quot;{searchQuery}&quot;
                </div>
              ) : (
                <div className="flex flex-col gap-4 max-h-[calc(100vh-17rem)] overflow-y-auto pr-1">
                  {/* Short-Term Wallet Section */}
                  {showWallet && wallet ? (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/50">
                          Short-Term Wallet
                        </span>
                        <span className="text-[10px] text-base-content/50">
                          {plan.keepWalletFull ? 'Rolling' : 'Refill'} {yearsPhrase(windowYears)}
                        </span>
                      </div>
                      <AccountListItem
                        account={wallet}
                        isSelected={selectedId === wallet.id}
                        isWallet
                        badge="Wallet"
                        presentation={presentation}
                        onClick={() => selectAccount(wallet)}
                      />
                    </div>
                  ) : null}

                  {/* Long-Term Accounts Section */}
                  {filteredLongTerm.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/50">
                          Long-term (sold first)
                        </span>
                        <span className="text-[10px] text-base-content/50">
                          Taxable · Drag to order
                        </span>
                      </div>
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(e) => reorderGroup('longTerm', e)}
                      >
                        <SortableContext
                          items={longTerm.map((a) => a.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="flex flex-col gap-2">
                            {filteredLongTerm.map((account) => {
                              const globalIndex = replenishable.findIndex(
                                (a) => a.id === account.id,
                              )
                              const badge = account.transfer?.enabled
                                ? `Term ${account.transfer.durationYears}y`
                                : `Deplete ${globalIndex + 1}`
                              return (
                                <SortableAccountListItem
                                  key={account.id}
                                  account={account}
                                  isSelected={selectedId === account.id}
                                  badge={badge}
                                  presentation={presentation}
                                  canReorder={longTerm.length > 1}
                                  onClick={() => selectAccount(account)}
                                />
                              )
                            })}
                          </div>
                        </SortableContext>
                      </DndContext>
                    </div>
                  ) : null}

                  {/* Retirement Accounts Section */}
                  {filteredRetirement.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/50">
                          401(k) & IRA (sold after long-term)
                        </span>
                        <span className="text-[10px] text-base-content/50">
                          Tax-advantaged · Drag to order
                        </span>
                      </div>
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(e) => reorderGroup('retirement', e)}
                      >
                        <SortableContext
                          items={retirement.map((a) => a.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="flex flex-col gap-2">
                            {filteredRetirement.map((account) => {
                              const globalIndex = replenishable.findIndex(
                                (a) => a.id === account.id,
                              )
                              return (
                                <SortableAccountListItem
                                  key={account.id}
                                  account={account}
                                  isSelected={selectedId === account.id}
                                  badge={`Deplete ${globalIndex + 1}`}
                                  presentation={presentation}
                                  canReorder={retirement.length > 1}
                                  onClick={() => selectAccount(account)}
                                />
                              )
                            })}
                          </div>
                        </SortableContext>
                      </DndContext>
                    </div>
                  ) : null}
                </div>
              )}

              <button
                type="button"
                className="btn btn-outline btn-sm w-full gap-1 mt-1"
                onClick={addLongTerm}
              >
                <PlusIcon />
                New long-term account
              </button>
            </div>
          </div>
        </aside>

        {/* Right Detail Pane */}
        <main className="lg:col-span-7 xl:col-span-8 flex flex-col gap-4">
          {activeAccount ? (
            isWalletAccount(activeAccount) ? (
              <WalletDetailPane
                account={activeAccount}
                funding={funding}
                windowYears={windowYears}
                keepFull={plan.keepWalletFull}
                presentation={presentation}
                onChange={(next) => update(activeAccount.id, next)}
              />
            ) : (
              <AccountDetailPane
                account={activeAccount}
                allAccounts={accounts}
                ageToday={ageToday}
                simulationYears={simYears}
                firstRmd={firstRmds.get(activeAccount.id) ?? null}
                rmdStart={rmdStart}
                lastAge={lastAge}
                presentation={presentation}
                depletionIndex={replenishable.findIndex((a) => a.id === activeAccount.id) + 1}
                canRemove={activeAccount.kind === 'longTerm' && longTerm.length > 1}
                canMoveUp={
                  activeAccount.kind === 'longTerm'
                    ? longTerm.findIndex((a) => a.id === activeAccount.id) > 0
                    : retirement.findIndex((a) => a.id === activeAccount.id) > 0
                }
                canMoveDown={
                  activeAccount.kind === 'longTerm'
                    ? longTerm.findIndex((a) => a.id === activeAccount.id) < longTerm.length - 1
                    : retirement.findIndex((a) => a.id === activeAccount.id) < retirement.length - 1
                }
                onChange={(next) => update(activeAccount.id, next)}
                onRemove={() => removeAccount(activeAccount.id)}
                onMoveUp={() =>
                  moveInGroup(
                    activeAccount.kind === 'longTerm' ? 'longTerm' : 'retirement',
                    activeAccount.id,
                    -1,
                  )
                }
                onMoveDown={() =>
                  moveInGroup(
                    activeAccount.kind === 'longTerm' ? 'longTerm' : 'retirement',
                    activeAccount.id,
                    1,
                  )
                }
              />
            )
          ) : (
            <div className="card bg-base-100 shadow-sm border border-base-200">
              <div className="card-body p-8 text-center flex flex-col items-center gap-3">
                <h3 className="font-semibold text-lg">No account selected</h3>
                <p className="text-sm text-base-content/70 max-w-sm">
                  Choose an account from the list on the left to configure its balance, growth rate,
                  tax rate, and transfer schedule.
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-sm gap-1.5"
                  onClick={addLongTerm}
                >
                  <PlusIcon />
                  Add long-term
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function AccountListItem({
  account,
  isSelected,
  isWallet = false,
  badge,
  presentation,
  dragHandle,
  onClick,
}: {
  account: SavingsAccount
  isSelected: boolean
  isWallet?: boolean
  badge: string
  presentation: boolean
  dragHandle?: ReactNode
  onClick: () => void
}) {
  const isRoth = account.kind === 'rothIra'
  const hasTransfer = account.transfer?.enabled === true
  const hasRmd = accountHasRmd(account.kind)
  const historical = account.returnMode === 'historical'
  const pathLabel = historical
    ? getMarketPeriod(account.historicalPeriodId)?.label ??
      (account.historicalStartYear != null ? `S&P from ${account.historicalStartYear}` : 'Historical S&P')
    : null

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className={`group relative text-left p-3 rounded-box border transition-all cursor-pointer ${
        isSelected
          ? 'bg-base-200/80 border-primary shadow-sm ring-1 ring-primary'
          : 'bg-base-100 hover:bg-base-200/50 border-base-200 hover:border-base-300'
      }`}
    >
      {/* Accent left indicator */}
      <div
        className={`absolute left-0 top-2 bottom-2 w-1 rounded-r ${
          isSelected ? 'bg-primary' : 'bg-transparent'
        }`}
      />

      <div className="flex flex-col gap-1 pl-1">
        {/* Name and Badges */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {dragHandle}
            <span className="font-semibold text-sm truncate text-base-content">
              {account.name.trim() || labelForKind(account.kind)}
            </span>
          </div>
          <span className="badge badge-xs badge-outline shrink-0">{badge}</span>
        </div>

        {/* Amount and Key Stats */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-bold tabular-nums text-base-content text-sm">
              {maskUsd(account.amount, presentation, usd)}
            </span>
            <span className="text-base-content/60 text-[11px] tabular-nums truncate">
              ·{' '}
              {pathLabel
                ? pathLabel
                : `${formatPercent(account.annualReturnPercent, 1)}/yr`}
            </span>
            {!isWallet ? (
              <span className="text-base-content/60 text-[11px] tabular-nums">
                · {isRoth ? '0%' : `${account.taxRatePercent}%`} tax
              </span>
            ) : null}
          </div>

          {isSelected ? <span className="text-primary font-bold text-xs shrink-0">→</span> : null}
        </div>

        {/* Subtitle / Flags */}
        <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[11px] text-base-content/60">
          <span className="badge badge-xs badge-ghost">{kindLabel(account.kind)}</span>
          {hasRmd ? <span className="badge badge-xs badge-info/20 text-info">RMD</span> : null}
          {isRoth ? (
            <span className="badge badge-xs badge-success/20 text-success">Tax-free</span>
          ) : null}
          {hasTransfer ? (
            <span className="badge badge-xs badge-primary/20 text-primary">
              Transfers in {account.transfer!.durationYears}y
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function SortableAccountListItem({
  account,
  isSelected,
  badge,
  presentation,
  canReorder,
  onClick,
}: {
  account: SavingsAccount
  isSelected: boolean
  badge: string
  presentation: boolean
  canReorder: boolean
  onClick: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: account.id,
    disabled: !canReorder,
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 1 : undefined,
      }}
    >
      <AccountListItem
        account={account}
        isSelected={isSelected}
        badge={badge}
        presentation={presentation}
        dragHandle={
          canReorder ? (
            <button
              type="button"
              className="btn btn-ghost btn-xs p-0 size-5 cursor-grab touch-none active:cursor-grabbing text-base-content/50 hover:text-base-content"
              aria-label={`Drag to reorder ${account.name}`}
              onClick={(e) => e.stopPropagation()}
              {...attributes}
              {...listeners}
            >
              <GripIcon />
            </button>
          ) : null
        }
        onClick={onClick}
      />
    </div>
  )
}

function AccountDetailPane({
  account,
  allAccounts = [],
  ageToday = null,
  simulationYears,
  firstRmd,
  rmdStart,
  lastAge,
  presentation,
  depletionIndex,
  canRemove,
  canMoveUp,
  canMoveDown,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  account: SavingsAccount
  allAccounts: SavingsAccount[]
  ageToday: number | null
  simulationYears: number
  firstRmd: FirstRmd | null
  rmdStart: number
  lastAge: number | null
  presentation: boolean
  depletionIndex: number
  canRemove: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onChange: (account: SavingsAccount) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const isRoth = account.kind === 'rothIra'
  const returnMode = account.returnMode === 'historical' ? 'historical' : 'flat'
  const periods = listResolvableMarketPeriods(simulationYears)
  const minStart = minHistoricalStartYear(simulationYears)
  const maxStart = Math.max(minStart, maxHistoricalStartYear(simulationYears) - simulationYears + 1)
  const defaultPeriod = periods.find((p) => p.periodId === 'post-gfc-boom') ?? periods[0]
  const defaultStart = Math.min(
    defaultPeriod?.startYear ?? clampHistoricalStartYear(2009, simulationYears),
    maxStart,
  )
  const startYear = Math.min(
    account.historicalStartYear ?? defaultStart,
    maxStart,
  )
  const resolved =
    returnMode === 'historical'
      ? resolveReturnPath(startYear, simulationYears, account.historicalPeriodId)
      : null
  const selectedPeriodId = resolved?.periodId ?? ''
  const defaultPeriodId = defaultPeriod?.periodId ?? 'post-gfc-boom'
  const isRetirement = isRetirementAccount(account.kind)
  const otherAccounts = allAccounts.filter((a) => a.id !== account.id)
  const targetAccount = allAccounts.find((a) => a.id === account.transfer?.targetAccountId)
  const targetAccountName = targetAccount
    ? targetAccount.name.trim() || labelForKind(targetAccount.kind)
    : 'selected account'

  return (
    <article className="card bg-base-100 shadow-sm border border-base-200">
      <div className="card-body p-4 sm:p-6 gap-6">
        {/* Detail Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between pb-4 border-b border-base-200">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-base-content/60">
              Account Name
            </label>
            <input
              className="input input-bordered input-lg font-bold w-full max-w-lg text-lg"
              value={account.name}
              onChange={(event) => onChange({ ...account, name: event.target.value })}
              placeholder="e.g. Brokerage, 401(k), Roth IRA"
              aria-label="Account name"
            />
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="badge badge-sm badge-outline font-semibold">
                Deplete #{depletionIndex}
              </span>
              <span className="badge badge-sm badge-ghost">{kindLabel(account.kind)}</span>
              {isRoth ? (
                <span className="badge badge-sm badge-success/20 text-success font-medium">
                  Tax-free
                </span>
              ) : null}
              {accountHasRmd(account.kind) ? (
                <span className="badge badge-sm badge-info/20 text-info font-medium">
                  RMD from age {rmdStart}
                </span>
              ) : null}
              {account.transfer?.enabled ? (
                <span className="badge badge-sm badge-primary/20 text-primary font-medium">
                  Transfers in {account.transfer.durationYears}y
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-end sm:self-start">
            <div className="join">
              <button
                type="button"
                className="join-item btn btn-outline btn-xs"
                disabled={!canMoveUp}
                onClick={onMoveUp}
                title="Sell earlier in refill order"
              >
                ▲ Sell earlier
              </button>
              <button
                type="button"
                className="join-item btn btn-outline btn-xs"
                disabled={!canMoveDown}
                onClick={onMoveDown}
                title="Sell later in refill order"
              >
                ▼ Sell later
              </button>
            </div>
            {canRemove ? (
              <button
                type="button"
                className="btn btn-ghost btn-xs text-error hover:bg-error/10"
                onClick={onRemove}
              >
                Delete account
              </button>
            ) : null}
          </div>
        </div>

        {/* Core Financial Settings */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <NumberField
            label="Amount today"
            prefix="$"
            masked={presentation}
            value={account.amount}
            min={0}
            step={1000}
            hint="Starting balance"
            onChange={(amount) => onChange({ ...account, amount })}
          />

          <NumberField
            label="Tax when sold"
            suffix="%"
            masked={presentation}
            value={isRoth ? 0 : account.taxRatePercent}
            min={0}
            max={99}
            step={1}
            hint={
              isRoth
                ? 'Roth IRA is always tax-free (0%).'
                : `Wallet keeps full refill; extra is sold to cover ${formatPercent(account.taxRatePercent, 0)} tax.`
            }
            onChange={(taxRatePercent) =>
              onChange({ ...account, taxRatePercent: isRoth ? 0 : taxRatePercent })
            }
          />
        </div>

        {/* Return mode: flat OR historical S&P path */}
        <div className="rounded-box border border-base-200 bg-base-200/30 p-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h4 className="font-bold text-sm text-base-content/90">Investment returns</h4>
            <p className="text-xs text-base-content/65 leading-relaxed">
              Choose a constant rate or replay real S&P year-over-year returns for a historical
              window sized to this plan ({simulationYears} growth years).
            </p>
          </div>

          <div role="tablist" className="tabs tabs-box bg-base-100 p-1 border border-base-200 w-fit">
            <button
              type="button"
              role="tab"
              className={`tab tab-sm ${returnMode === 'flat' ? 'tab-active font-semibold' : ''}`}
              onClick={() =>
                onChange({
                  ...account,
                  returnMode: 'flat',
                  historicalPeriodId: undefined,
                  historicalStartYear: undefined,
                })
              }
            >
              Flat rate
            </button>
            <button
              type="button"
              role="tab"
              className={`tab tab-sm ${returnMode === 'historical' ? 'tab-active font-semibold' : ''}`}
              onClick={() => {
                const preset = resolveMarketPeriod(account.historicalPeriodId ?? defaultPeriodId, simulationYears)
                const start = Math.min(
                  account.historicalStartYear ?? preset?.startYear ?? defaultStart,
                  maxStart,
                )
                onChange({
                  ...account,
                  returnMode: 'historical',
                  historicalPeriodId: preset?.periodId ?? account.historicalPeriodId ?? defaultPeriodId,
                  historicalStartYear: start,
                })
              }}
            >
              Historical S&P path
            </button>
          </div>

          {returnMode === 'flat' ? (
            <NumberField
              label="Growth rate"
              suffix="% / year"
              masked={presentation}
              value={account.annualReturnPercent}
              step={0.1}
              hint="Same return every year"
              onChange={(annualReturnPercent) => onChange({ ...account, annualReturnPercent })}
            />
          ) : (
            <div className="flex flex-col gap-3">
              <fieldset className="fieldset min-w-0">
                <legend className="fieldset-legend text-xs font-semibold">
                  Jump to an interesting period
                </legend>
                <select
                  className="select select-bordered select-sm w-full text-xs"
                  value={selectedPeriodId}
                  onChange={(event) => {
                    const id = event.target.value
                    if (!id) return
                    const preset = resolveMarketPeriod(id, simulationYears)
                    if (!preset) return
                    const nextStart = Math.min(preset.startYear, maxStart)
                    onChange({
                      ...account,
                      returnMode: 'historical',
                      historicalPeriodId: nextStart === preset.startYear ? preset.periodId : undefined,
                      historicalStartYear: nextStart,
                    })
                  }}
                >
                  <option value="">Custom start year (use slider)</option>
                  {periods
                    .filter((period) => period.startYear <= maxStart)
                    .map((period) => (
                    <option key={period.periodId} value={period.periodId}>
                      {tonePrefix(period.tone ?? 'regular')} {period.label} · from {period.startYear}
                      · avg {period.averagePercent.toFixed(1)}%/yr over {simulationYears}y
                    </option>
                  ))}
                </select>
              </fieldset>

              <fieldset className="fieldset min-w-0">
                <legend className="fieldset-legend text-xs font-semibold">
                  Start year · from {startYear} → {startYear + simulationYears - 1}
                </legend>
                <input
                  type="range"
                  className="range range-primary range-sm w-full"
                  min={minStart}
                  max={maxStart}
                  step={1}
                  value={startYear}
                  aria-label={`S&P start year for ${account.name.trim() || labelForKind(account.kind)}`}
                  onFocus={() => setLastSpSliderAccountId(account.id)}
                  onChange={(event) => {
                    const nextStart = Math.min(
                      clampHistoricalStartYear(Number(event.target.value), simulationYears),
                      maxStart,
                    )
                    const matching = periods.find((p) => p.startYear === nextStart)
                    setLastSpSliderAccountId(account.id)
                    onChange({
                      ...account,
                      returnMode: 'historical',
                      historicalStartYear: nextStart,
                      historicalPeriodId: matching?.periodId,
                    })
                  }}
                />
                <div className="flex justify-between text-[10px] text-base-content/50 tabular-nums mt-1 gap-2">
                  <span>{minStart}</span>
                  <span className="text-center">
                    Applies to all S&P accounts · data {SP500_DATA_START}–{SP500_DATA_END} ·
                    Shift+← / Shift+→ to nudge
                  </span>
                  <span>{maxStart}</span>
                </div>
              </fieldset>

              {resolved ? (
                <div className="rounded-box border border-base-300 bg-base-100 p-3 flex flex-col gap-3 text-xs">
                  <div className="flex flex-wrap items-end justify-between gap-3 rounded-box border border-primary/25 bg-primary/5 px-3 py-2.5">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-base-content/55">
                        Average return · {simulationYears} simulation years
                      </span>
                      <span className="text-lg font-bold tabular-nums text-primary">
                        {formatPercent(resolved.averagePercent, 1)} / year
                      </span>
                      <span className="text-[11px] text-base-content/60">
                        Simple average of the {simulationYears} yearly S&P returns from {startYear}–
                        {startYear + simulationYears - 1}
                        {resolved.wrapped ? ' (with wrap)' : ''}
                      </span>
                    </div>
                    <div className="text-right text-[11px] tabular-nums text-base-content/65">
                      <div>
                        CAGR {formatPercent(resolved.cagrPercent, 1)}
                      </div>
                      <div>
                        Range {formatPercent(resolved.worstYearPercent, 0)} to{' '}
                        {formatPercent(resolved.bestYearPercent, 0)}
                      </div>
                    </div>
                  </div>

                  {resolved.blurb ? (
                    <p className="text-base-content/80 leading-relaxed">{resolved.blurb}</p>
                  ) : (
                    <p className="text-base-content/80 leading-relaxed">
                      Custom window of real S&P year-over-year total returns from the downloaded
                      Shiller series.
                    </p>
                  )}
                  <p className="font-medium text-base-content/90">
                    {formatReturnPathSummary(resolved, simulationYears)}
                  </p>
                  <p className="text-base-content/60">
                    Each simulation year applies that calendar year&apos;s S&P % in order, starting at{' '}
                    {resolved.startYear}. If the plan reaches the end of the downloaded data (
                    {resolved.endYear}), it starts over again at {resolved.startYear} — not at the
                    beginning of the full series — and continues until the plan ends.
                  </p>
                  <details className="mt-1">
                    <summary className="cursor-pointer font-medium text-base-content/70">
                      Year-by-year returns ({resolved.returns.length})
                    </summary>
                    <ul className="mt-2 max-h-40 overflow-y-auto columns-2 sm:columns-3 gap-3 text-[11px] tabular-nums">
                      {resolved.returns.map((pct, index) => {
                        const histYear =
                          resolved.startYear + (index % resolved.cycleLength)
                        return (
                          <li key={`y${index + 1}`} className="break-inside-avoid">
                            y{index + 1} ({histYear}
                            {index >= resolved.cycleLength ? '↻' : ''}):{' '}
                            <span className={pct < 0 ? 'text-error' : 'text-success'}>
                              {formatPercent(pct, 1)}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </details>
                </div>
              ) : (
                <div className="alert alert-warning py-2 text-xs">
                  <span>Could not resolve that window for a {simulationYears}-year plan.</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Depletion Priority Explanation Box */}
        <div className="rounded-box border border-base-200 bg-base-200/40 p-3.5 flex flex-col gap-1 text-xs">
          <div className="flex items-center gap-2 font-semibold text-base-content/85">
            <span>Refill Priority: #{depletionIndex}</span>
            <span className="text-base-content/50">·</span>
            <span>{isRetirement ? 'Retirement group' : 'Long-term group'}</span>
          </div>
          <p className="text-base-content/70">
            {isRetirement
              ? `Retirement accounts are sold only after all long-term accounts are depleted. From age ${rmdStart}, required minimum distributions sell into the primary long-term source.`
              : 'Taxable accounts are sold in this order to refill the short-term wallet. Tax is deducted when sold so the wallet receives the exact needed refill amount.'}
          </p>
        </div>

        {/* Limited Duration & Transfer Section */}
        <div className="rounded-box border border-base-200 bg-base-200/40 p-4 sm:p-5 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">
                  Limited duration / transfer to another account
                </span>
                {account.transfer?.enabled ? (
                  <span className="badge badge-xs badge-primary">Active</span>
                ) : null}
              </div>
              <p className="text-xs text-base-content/70">
                Optionally specify a term limit. When the term concludes, this account will be sold
                and its proceeds transferred into another selected account.
              </p>
            </div>

            <label className="label cursor-pointer gap-2 py-0 shrink-0">
              <span className="label-text text-xs text-base-content/60 select-none">
                {account.transfer?.enabled ? 'On' : 'Off'}
              </span>
              <input
                type="checkbox"
                className="toggle toggle-primary toggle-sm"
                checked={account.transfer?.enabled === true}
                onChange={(e) => {
                  const enabled = e.target.checked
                  const defaultTarget =
                    otherAccounts.find((a) => a.kind === 'longTerm')?.id ??
                    otherAccounts[0]?.id ??
                    ''
                  onChange({
                    ...account,
                    transfer: {
                      enabled,
                      durationYears: account.transfer?.durationYears ?? 5,
                      targetAccountId: account.transfer?.targetAccountId || defaultTarget,
                      lockRefills: account.transfer?.lockRefills ?? true,
                      taxExempt: account.transfer?.taxExempt ?? false,
                    },
                  })
                }}
                aria-label={`Toggle transfer for ${account.name}`}
              />
            </label>
          </div>

          {account.transfer?.enabled ? (
            <div className="rounded-box bg-base-100 p-4 border border-primary/30 shadow-xs flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
                <NumberField
                  label="Duration until sold & transferred"
                  suffix="years"
                  min={1}
                  max={60}
                  step={1}
                  value={account.transfer.durationYears}
                  hint={`Transfers in Year ${account.transfer.durationYears}${
                    ageToday != null ? ` (age ${ageToday + account.transfer.durationYears})` : ''
                  }`}
                  onChange={(durationYears) =>
                    onChange({
                      ...account,
                      transfer: {
                        ...account.transfer!,
                        durationYears: Math.max(1, Math.round(durationYears)),
                      },
                    })
                  }
                />

                <fieldset className="fieldset min-w-0">
                  <legend className="fieldset-legend text-xs font-semibold">
                    Transfer Destination
                  </legend>
                  <select
                    className="select select-bordered select-sm w-full text-xs"
                    value={account.transfer.targetAccountId}
                    onChange={(e) =>
                      onChange({
                        ...account,
                        transfer: {
                          ...account.transfer!,
                          targetAccountId: e.target.value,
                        },
                      })
                    }
                  >
                    {otherAccounts.map((dest) => (
                      <option key={dest.id} value={dest.id}>
                        {dest.name.trim() || labelForKind(dest.kind)} ({kindLabel(dest.kind)})
                      </option>
                    ))}
                  </select>
                  <p className="label text-[11px] text-base-content/60">
                    Account that receives the net proceeds
                  </p>
                </fieldset>

                <div className="flex flex-col gap-2 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-xs checkbox-primary"
                      checked={account.transfer.lockRefills === true}
                      onChange={(e) =>
                        onChange({
                          ...account,
                          transfer: {
                            ...account.transfer!,
                            lockRefills: e.target.checked,
                          },
                        })
                      }
                    />
                    <span className="text-base-content/80">
                      Lock from wallet refills until transfer
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-xs checkbox-primary"
                      checked={account.transfer.taxExempt === true}
                      onChange={(e) =>
                        onChange({
                          ...account,
                          transfer: {
                            ...account.transfer!,
                            taxExempt: e.target.checked,
                          },
                        })
                      }
                    />
                    <span className="text-base-content/80">Tax-exempt transfer (0% tax)</span>
                  </label>
                </div>
              </div>

              <div className="alert alert-info py-2.5 px-3 text-xs">
                <span>
                  After <strong>{account.transfer.durationYears} {account.transfer.durationYears === 1 ? 'year' : 'years'}</strong>, this account’s balance will be sold and transferred to <strong>{targetAccountName}</strong>.
                  {account.transfer.taxExempt
                    ? ' Transfer is tax-exempt.'
                    : ` Standard ${formatPercent(account.taxRatePercent, 0)} tax applies on sale.`}
                  {account.transfer.lockRefills
                    ? ' Locked from wallet refills until transfer.'
                    : ' Can still be used to refill the wallet beforehand if needed.'}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        {/* RMD Note (for retirement accounts) */}
        <RmdNote
          account={account}
          firstRmd={firstRmd}
          rmdStart={rmdStart}
          lastAge={lastAge}
          presentation={presentation}
        />
      </div>
    </article>
  )
}

function WalletDetailPane({
  account,
  funding,
  windowYears,
  keepFull,
  presentation,
  onChange,
}: {
  account: SavingsAccount
  funding: ReturnType<typeof openingWalletFunding>
  windowYears: number
  keepFull: boolean
  presentation: boolean
  onChange: (account: SavingsAccount) => void
}) {
  return (
    <article className="card bg-base-100 shadow-sm border border-base-200">
      <div className="card-body p-4 sm:p-6 gap-6">
        {/* Wallet Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between pb-4 border-b border-base-200">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-base-content/60">
              Account Name
            </label>
            <input
              className="input input-bordered input-lg font-bold w-full max-w-lg text-lg"
              value={account.name}
              onChange={(event) =>
                onChange({ ...account, name: event.target.value, kind: 'shortTerm' })
              }
              placeholder="Short-term wallet"
              aria-label="Wallet name"
            />
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="badge badge-primary font-semibold">Active Wallet</span>
              <span className="badge badge-outline">
                {keepFull ? 'Rolling' : 'Refill'} {yearsPhrase(windowYears)} window
              </span>
            </div>
          </div>
        </div>

        {/* Amount & Growth Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <NumberField
            label="Amount today"
            prefix="$"
            masked={presentation}
            value={account.amount}
            min={0}
            step={1000}
            hint="Cash balance today in this active wallet"
            onChange={(amount) => onChange({ ...account, amount, kind: 'shortTerm' })}
          />
          <NumberField
            label="Growth rate"
            suffix="% / year"
            masked={presentation}
            value={account.annualReturnPercent}
            step={0.1}
            hint="Yield earned on cash in the wallet (default 2%)"
            onChange={(annualReturnPercent) =>
              onChange({ ...account, annualReturnPercent, kind: 'shortTerm' })
            }
          />
        </div>

        {/* Wallet Mechanics Explanation */}
        <div className="rounded-box border border-base-200 bg-base-200/40 p-4 flex flex-col gap-2 text-xs">
          <h4 className="font-bold text-sm text-base-content/90">How the Wallet Works</h4>
          <p className="text-base-content/75 leading-relaxed">
            All everyday retirement spending is withdrawn directly from this active wallet.
            You can enter a starting cash balance for today. If the wallet runs out of funds to cover upcoming spending
            (or at scheduled refill intervals), eligible savings accounts are sold to replenish it.
          </p>
          <p className="text-base-content/75 leading-relaxed">
            {keepFull
              ? `Keep wallet full is ON: After each year of spending, enough is sold from savings so the wallet still holds the full next ${yearsPhrase(windowYears)}.`
              : `Every ${yearsPhrase(windowYears)} — or sooner if cash runs out — your long-term and retirement accounts are sold to refill the wallet.`}
          </p>
        </div>

        {/* Opening Funding Card */}
        <OpeningTransfer
          funding={funding}
          windowYears={windowYears}
          keepFull={keepFull}
          presentation={presentation}
        />
      </div>
    </article>
  )
}

function OpeningTransfer({
  funding,
  windowYears,
  keepFull,
  presentation,
}: {
  funding: ReturnType<typeof openingWalletFunding>
  windowYears: number
  keepFull: boolean
  presentation: boolean
}) {
  const windowLabel = yearsPhrase(windowYears)
  if (funding.need <= 0.005 || funding.moves.length === 0) {
    return (
      <div className="alert alert-info py-3 text-xs">
        <span>Active wallet balance and income cover initial spending, so nothing is sold from other accounts at the start.</span>
      </div>
    )
  }

  return (
    <div className="rounded-box border border-warning/40 bg-warning/10 p-4 flex flex-col gap-2 text-xs">
      <div className="flex items-center justify-between">
        <p className="font-bold text-sm text-base-content/90">Opening Wallet Funding · Today</p>
        <span className="badge badge-xs badge-warning">Initial Refill</span>
      </div>
      <p className="text-base-content/80 leading-relaxed">
        {maskUsd(funding.filled, presentation, usd)} moved into the wallet for the next{' '}
        {windowLabel} of spending minus income.
        {keepFull
          ? ' After each later year, enough is sold to put one more year back in so that window stays full.'
          : ''}
      </p>
      <ul className="flex flex-col gap-1 mt-1 font-medium tabular-nums">
        {funding.moves.map((move) => (
          <li key={`${move.fromId}:${move.toId}`} className="flex items-center gap-2">
            <span>• Sold {maskUsd(move.sold, presentation, usd)} from {move.fromName}</span>
            {move.tax > 0.005 ? (
              <span className="text-error">
                (tax {maskUsd(move.tax, presentation, usd)})
              </span>
            ) : null}
            <span>→ wallet received {maskUsd(move.net, presentation, usd)}</span>
          </li>
        ))}
      </ul>
      {funding.filled + 0.5 < funding.need ? (
        <p className="mt-1 text-warning font-semibold">
          Only {maskUsd(funding.filled, presentation, usd)} of the{' '}
          {maskUsd(funding.need, presentation, usd)} needed could be sold.
        </p>
      ) : null}
    </div>
  )
}

function RmdNote({
  account,
  firstRmd,
  rmdStart,
  lastAge,
  presentation = false,
}: {
  account: SavingsAccount
  firstRmd?: FirstRmd | null
  rmdStart?: number
  lastAge?: number | null
  presentation?: boolean
}) {
  if (!accountHasRmd(account.kind)) return null

  if (account.amount <= 0.005) {
    return (
      <div className="rounded-box border border-base-200 bg-base-200/40 p-3 text-xs text-base-content/70">
        Amount today is {presentation ? '$•••' : '$0'}, so this account is never sold for an RMD.
      </div>
    )
  }

  if (firstRmd) {
    const when =
      firstRmd.yearOffset === 0
        ? firstRmd.age != null
          ? `today at age ${firstRmd.age}`
          : 'today'
        : firstRmd.age != null
          ? `at age ${firstRmd.age} (${firstRmd.yearOffset} years from now)`
          : `in ${firstRmd.yearOffset} years`
    return (
      <div className="rounded-box border border-info/40 bg-info/10 p-3.5 flex flex-col gap-1 text-xs">
        <div className="flex items-center justify-between">
          <p className="font-bold text-sm text-base-content/90">First RMD · {when}</p>
          <span className="badge badge-xs badge-info">Required Distribution</span>
        </div>
        <p className="text-base-content/80 leading-relaxed">
          Sells {maskUsd(firstRmd.move.sold, presentation, usd)}
          {firstRmd.move.tax > 0.005
            ? ` (tax ${maskUsd(firstRmd.move.tax, presentation, usd)})`
            : ''}{' '}
          into {firstRmd.move.toName} (1 ÷ years until 100). The leftover balance continues to grow.
          Refills do not sell this account while long-term still has money.
        </p>
      </div>
    )
  }

  if (rmdStart != null && lastAge != null && lastAge < rmdStart) {
    return (
      <div className="alert alert-warning py-2.5 px-3 text-xs">
        <span>
          This projection ends at age {lastAge}, before RMDs start at age {rmdStart}. Raise
          &quot;Project until age&quot; to see this account sold.
        </span>
      </div>
    )
  }

  return (
    <div className="rounded-box border border-base-200 bg-base-200/40 p-3 text-xs text-base-content/70">
      No RMD was recorded on this plan. Check date of birth and that the projection runs past age{' '}
      {rmdStart ?? 73}.
    </div>
  )
}

function kindLabel(kind: AccountKind): string {
  if (kind === 'longTerm') return 'Long-term'
  return labelForKind(kind)
}

function tonePrefix(tone: 'crash' | 'boom' | 'mixed' | 'regular'): string {
  switch (tone) {
    case 'crash':
      return '↓'
    case 'boom':
      return '↑'
    case 'mixed':
      return '↕'
    default:
      return '·'
  }
}

function PlusIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="size-4"
      aria-hidden
    >
      <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
    </svg>
  )
}

function GripIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="size-4"
      aria-hidden
    >
      <path d="M7 4a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM7 10a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM7 16a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM16 4a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM16 10a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM16 16a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
    </svg>
  )
}
