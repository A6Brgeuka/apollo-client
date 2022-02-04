import { useEffect, useState } from "react";
import { equal } from "@wry/equality";

import { mergeDeepArray } from "../../utilities";
import {
  Cache,
  Reference,
  StoreObject,
  MissingTree,
} from "../../cache";

import { useApolloClient } from "./useApolloClient";

export interface UseFragmentOptions<TData, TVars>
extends Omit<
  Cache.DiffOptions<TData, TVars>,
  | "id"
  | "query"
  | "optimistic"
>, Omit<
  Cache.ReadFragmentOptions<TData, TVars>,
  | "id"
> {
  from: StoreObject | Reference | string;
  // Override this field to make it optional (default: true).
  optimistic?: boolean;
}

// Since the above definition of UseFragmentOptions can be hard to parse without
// help from TypeScript/VSCode, here are the intended fields and their types.
// Uncomment this code to check that it's consistent with the definition above.
//
// export interface UseFragmentOptions<TData, TVars> {
//   from: string | StoreObject | Reference;
//   fragment: DocumentNode | TypedDocumentNode<TData, TVars>;
//   fragmentName?: string;
//   optimistic?: boolean;
//   variables?: TVars;
//   previousResult?: any;
//   returnPartialData?: boolean;
//   canonizeResults?: boolean;
// }

export interface UseFragmentResult<TData> {
  data: TData | undefined;
  complete: boolean;
  missing?: MissingTree;
  previousResult?: UseFragmentResult<TData>;
  lastCompleteResult?: UseFragmentResult<TData>;
}

export function useFragment<TData, TVars>(
  options: UseFragmentOptions<TData, TVars>,
): UseFragmentResult<TData> {
  const { cache } = useApolloClient();

  const {
    fragment,
    fragmentName,
    from,
    optimistic = true,
    ...rest
  } = options;

  const diffOptions: Cache.DiffOptions<TData, TVars> = {
    ...rest,
    id: typeof from === "string" ? from : cache.identify(from),
    query: cache["getFragmentDoc"](fragment, fragmentName),
    optimistic,
  };

  let latestDiff = cache.diff<TData>(diffOptions);
  let [latestResult, setResult] =
    useState<UseFragmentResult<TData>>(() => diffToResult(latestDiff));

  useEffect(() => {
    let immediate = true;
    return cache.watch({
      ...diffOptions,
      immediate,
      callback(newDiff) {
        if (!immediate || !equal(newDiff, latestDiff)) {
          setResult(latestResult = diffToResult(
            latestDiff = newDiff,
            latestResult,
          ));
        }
        immediate = false;
      },
    });
  }, [latestDiff]);

  return latestResult;
}

function diffToResult<TData>(
  diff: Cache.DiffResult<TData>,
  previousResult?: UseFragmentResult<TData>,
): UseFragmentResult<TData> {
  const result: UseFragmentResult<TData> = {
    data: diff.result,
    complete: !!diff.complete,
  };

  if (diff.missing) {
    result.missing = mergeDeepArray(
      diff.missing.map(error => error.missing)
    );
  }

  if (previousResult) {
    result.previousResult = previousResult;
  }

  const lastCompleteResult = result.complete ? result : (
    previousResult && (
      previousResult.complete
        ? previousResult
        : previousResult.lastCompleteResult
    )
  );

  if (lastCompleteResult) {
    result.lastCompleteResult = lastCompleteResult;
  }

  return result;
}
