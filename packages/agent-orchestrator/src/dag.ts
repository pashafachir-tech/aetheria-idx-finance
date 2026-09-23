export interface DagNode<T> {
  id: string;
  dependsOn?: string[];
  run: () => Promise<T>;
}

export interface DagRunResult<T> {
  results: Record<string, T>;
  order: string[];
}

export async function runDag<T>(nodes: Array<DagNode<T>>): Promise<DagRunResult<T>> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (byId.size !== nodes.length) throw new Error("DAG contains duplicate node ids.");

  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const node of nodes) {
    indegree.set(node.id, (node.dependsOn ?? []).length);
    for (const dependency of node.dependsOn ?? []) {
      if (!byId.has(dependency)) throw new Error(`DAG node "${node.id}" depends on unknown node "${dependency}".`);
      dependents.set(dependency, [...(dependents.get(dependency) ?? []), node.id]);
    }
  }

  const results: Record<string, T> = {};
  const order: string[] = [];
  let ready = nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id);
  let processed = 0;

  while (ready.length > 0) {
    const batch = ready;
    ready = [];
    const settled = await Promise.all(batch.map(async (id) => ({ id, value: await byId.get(id)!.run() })));
    for (const { id, value } of settled) {
      results[id] = value;
      order.push(id);
      processed += 1;
      for (const dependent of dependents.get(id) ?? []) {
        const remaining = (indegree.get(dependent) ?? 0) - 1;
        indegree.set(dependent, remaining);
        if (remaining === 0) ready.push(dependent);
      }
    }
  }

  if (processed !== nodes.length) throw new Error("DAG contains a cycle; orchestration cannot proceed.");
  return { results, order };
}