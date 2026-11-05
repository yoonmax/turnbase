import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ALGORITHM_SETS, CATALOG, UNAVAILABLE_SETS, coverage, getCase } from '../algorithms/AlgorithmCatalog.js';
import { SORTERS, filterCases, searchCases } from '../algorithms/AlgorithmSearch.js';
import { CaseDiagram } from '../algorithms/CaseDiagram.jsx';
import { AlgorithmDetail } from '../algorithms/AlgorithmDetail.jsx';
import { useProgress } from '../trainer/TrainingProgress.js';
import { EmptyState } from '../components/EmptyState.jsx';
import { goalReached } from '../trainer/caseSets.js';
import { applyMoves } from '../cube/CubeEngine.js';
import { SlidersHorizontal, Star } from 'lucide-react';

function CaseTile({ entry, selected, record }) {
  return (
    <Link
      to={`/algorithms/${entry.id}`}
      className={`case-tile group flex flex-col gap-2 p-3 no-underline text-ink rounded-2xl ${selected ? 'bg-[var(--fill)]' : 'hover:bg-[var(--fill)]'}`}
      data-testid="case-tile"
      data-case-id={entry.id}
      aria-current={selected ? 'true' : undefined}
    >
      <div className="flex items-start justify-between h-[76px]">
        <CaseDiagram entry={entry} size={76} />
        <div className="flex items-center gap-1 pt-0.5">
          {record?.favorite ? <Star size={12} strokeWidth={1.6} className="text-graphite" fill="currentColor" aria-label="Favourite" /> : null}
          {record?.learned ? <span className="w-1.5 h-1.5 rounded-full bg-ready" title="Learned" aria-label="Learned" data-testid="tile-learned" /> : null}
        </div>
      </div>
      <div className="min-w-0">
        <div className="text-[0.8125rem] font-medium truncate">
          {entry.family === 'oll' ? `${entry.number}. ${entry.name}` : entry.title}
        </div>
        <div className="notation text-[0.6875rem] leading-[1.45] text-graphite truncate">{entry.primary.notation}</div>
        <div className="text-[0.75rem] text-faint">
          {entry.moveCount} moves, {entry.complexity.toLowerCase()}
        </div>
      </div>
    </Link>
  );
}

export default function AlgorithmsPage() {
  const params = useParams();
  const navigate = useNavigate();
  const id = params['*'] || null;
  const selected = id ? getCase(id) : null;
  const [family, setFamily] = useState(selected?.family ?? 'pll');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('catalog');
  const [maxMoves, setMaxMoves] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const activeFilters = [category, status !== 'all', sort !== 'catalog', maxMoves].filter(Boolean).length;
  const load = useProgress((s) => s.load);
  const progress = useProgress((s) => s.progress);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (selected) setFamily(selected.family);
  }, [selected]);

  const searching = query.trim().length > 0;
  const cover = useMemo(() => coverage(), []);
  const currentSet = cover.find((s) => s.id === family);
  // Counted live, so this line cannot claim more than the engine confirms.
  const verifiedCount = useMemo(
    () => CATALOG.filter((c) => c.family === family && goalReached(c, applyMoves(c.caseState, c.primary.moves))).length,
    [family],
  );

  const categories = useMemo(() => [...new Set(CATALOG.filter((c) => c.family === family).map((c) => c.category))], [family]);

  const results = useMemo(() => {
    let list = filterCases(
      CATALOG,
      {
        family: searching ? null : family,
        category: searching ? null : category || null,
        learned: status === 'learned' ? true : status === 'unlearned' ? false : null,
        favorites: status === 'favorites',
        maxMoves: maxMoves ? Number(maxMoves) : null,
      },
      progress,
    );
    list = searchCases(list, query);
    if (sort === 'used') {
      list = [...list].sort((a, b) => (progress.get(b.id)?.timesUsed ?? 0) - (progress.get(a.id)?.timesUsed ?? 0));
    } else if (SORTERS[sort] && sort !== 'catalog') {
      list = [...list].sort(SORTERS[sort]);
    }
    return list;
  }, [family, query, searching, status, category, sort, maxMoves, progress]);

  const learnedCount = useMemo(() => CATALOG.filter((c) => c.family === family && progress.get(c.id)?.learned).length, [family, progress]);

  // Group by category when browsing in catalogue order.
  const grouped = useMemo(() => {
    if (searching || sort !== 'catalog') return [{ category: null, items: results }];
    const map = new Map();
    for (const entry of results) {
      if (!map.has(entry.category)) map.set(entry.category, []);
      map.get(entry.category).push(entry);
    }
    return [...map.entries()].map(([name, items]) => ({ category: name, items }));
  }, [results, searching, sort]);

  return (
    <div className="h-full flex min-h-0" data-testid="algorithms-page">
      <div className={`flex-1 min-w-0 flex-col min-h-0 overflow-y-auto scrollbar-quiet page-scroll ${selected ? 'hidden xl:flex xl:max-w-[44rem]' : 'flex'}`}>
        <header className="px-4 sm:px-6 pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="segmented overflow-x-auto max-w-full" role="group" aria-label="Algorithm set">
              {ALGORITHM_SETS.map((set) => (
                <button
                  key={set.id}
                  type="button"
                  aria-pressed={family === set.id && !searching}
                  data-testid={`set-${set.id}`}
                  onClick={() => {
                    setFamily(set.id);
                    setCategory('');
                    setQuery('');
                  }}
                >
                  {set.name}
                </button>
              ))}
            </div>
            <input
              type="search"
              className="field flex-1 min-w-[11rem] !rounded-full"
              placeholder="Search"
              aria-label="Search algorithms by name, number or notation"
              value={query}
              data-testid="algorithm-search"
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              type="button"
              className="icon-btn"
              aria-label="Filters"
              aria-pressed={showFilters || activeFilters > 0}
              aria-expanded={showFilters}
              title="Filters"
              data-testid="filters-toggle"
              onClick={() => setShowFilters((v) => !v)}
            >
              <SlidersHorizontal size={15} strokeWidth={1.8} />
            </button>
          </div>
          {showFilters ? (
            <div className="flex flex-wrap items-center gap-2 mt-2.5">
              <select className="field" aria-label="Category" value={category} disabled={searching} data-testid="filter-category" onChange={(e) => setCategory(e.target.value)}>
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <select className="field" aria-label="Learning status" value={status} data-testid="filter-status" onChange={(e) => setStatus(e.target.value)}>
                <option value="all">All cases</option>
                <option value="learned">Learned</option>
                <option value="unlearned">Not learned</option>
                <option value="favorites">Favourites</option>
              </select>
              <select className="field" aria-label="Sort" value={sort} data-testid="filter-sort" onChange={(e) => setSort(e.target.value)}>
                <option value="catalog">Standard order</option>
                <option value="shortest">Shortest first</option>
                <option value="longest">Longest first</option>
                <option value="used">Most used</option>
              </select>
              <select className="field" aria-label="Algorithm length" value={maxMoves} data-testid="filter-length" onChange={(e) => setMaxMoves(e.target.value)}>
                <option value="">Any length</option>
                <option value="6">Up to 6 moves</option>
                <option value="10">Up to 10 moves</option>
                <option value="14">Up to 14 moves</option>
              </select>
            </div>
          ) : null}
          <p className="m-0 mt-2.5 text-[0.8125rem] font-normal text-graphite" data-testid="coverage-line">
            {searching ? (
              <>
                {results.length} {results.length === 1 ? 'match' : 'matches'} across every set.
              </>
            ) : (
              <>
                {currentSet.count} of {currentSet.expected} cases, {verifiedCount === currentSet.count ? 'all' : verifiedCount} verified on the cube engine. {learnedCount} learned.
              </>
            )}
          </p>
        </header>

        <div className="px-2 sm:px-3" data-testid="case-grid">
          {results.length === 0 ? (
            <EmptyState title="No cases match">Clear the search or choose different filters to see more.</EmptyState>
          ) : (
            grouped.map((group) => (
              <section key={group.category ?? 'all'} className="case-section mt-4">
                {group.category ? <h2 className="m-0 mb-1 px-3 text-[0.8125rem] font-medium text-graphite">{group.category}</h2> : null}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]">
                  {group.items.map((entry) => (
                    <CaseTile key={entry.id} entry={entry} selected={entry.id === id} record={progress.get(entry.id)} />
                  ))}
                </div>
              </section>
            ))
          )}
          {!searching ? (
            <p className="mx-3 mt-8 mb-0 text-[0.75rem] text-faint max-w-[60ch]">
              Not in this library: {UNAVAILABLE_SETS.join(', ')}. You can animate any of them by pasting the algorithm into the editor on the Cube page.
            </p>
          ) : null}
        </div>
      </div>

      {selected ? (
        <div className="flex-1 min-w-0 xl:glass xl:rounded-[24px] xl:m-3 xl:mt-[var(--page-top)] overflow-hidden page-scroll xl:!pt-0 xl:!pb-0">
          <AlgorithmDetail key={selected.id} entry={selected} onBack={() => navigate('/algorithms')} />
        </div>
      ) : (
        <div className="hidden xl:flex flex-1 items-center justify-center">
          <EmptyState title="Choose a case">Its cube opens here, set up and ready to play.</EmptyState>
        </div>
      )}
    </div>
  );
}
