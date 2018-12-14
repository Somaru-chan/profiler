/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { storeWithProfile } from '../fixtures/stores';
import * as ProfileViewSelectors from '../../selectors/profile-view';
import * as UrlStateSelectors from '../../selectors/url-state';

import {
  changeCallTreeSearchString,
  changeInvertCallstack,
  updatePreviewSelection,
  changeImplementationFilter,
  changeSelectedCallNode,
  changeShowJsTracerSummary,
} from '../../actions/profile-view';
import { getProfileFromTextSamples } from '../fixtures/profiles/make-profile';

const { selectedThreadSelectors } = ProfileViewSelectors;

describe('selectors/getStackTimingByDepth', function() {
  /**
   * This table shows off how a stack chart gets filtered to JS only, where the number is
   * the stack index, and P is platform code, and J javascript.
   *
   *            Unfiltered             ->             JS Only
   *   0-10-20-30-40-50-60-70-80-90-91      0-10-20-30-40-50-60-70-80-90-91 <- Timing (ms)
   *  ================================     ================================
   *  0P 0P 0P 0P 0P 0P 0P 0P 0P 0P  |     0P 0P 0P 0P 0P 0P 0P 0P 0P 0P  |
   *  1P 1P 1P 1P    1P 1P 1P 1P 1P  |                       1J 1J 1J 1J  |
   *     2P 2P 3P       4J 4J 4J 4J  |                          2J 2J     |
   *                       5J 5J     |                             3P     |
   *                          6P     |                             4J     |
   *                          7P     |
   *                          8J     |
   */

  it('computes unfiltered stack timing by depth', function() {
    const store = storeWithProfile();
    const stackTimingByDepth = selectedThreadSelectors.getStackTimingByDepth(
      store.getState()
    );
    expect(stackTimingByDepth).toEqual([
      { start: [0], end: [91], stack: [0], length: 1 },
      { start: [0, 50], end: [40, 91], stack: [1, 1], length: 2 },
      { start: [10, 30, 60], end: [30, 40, 91], stack: [2, 3, 4], length: 3 },
      { start: [70], end: [90], stack: [5], length: 1 },
      { start: [80], end: [90], stack: [6], length: 1 },
      { start: [80], end: [90], stack: [7], length: 1 },
      { start: [80], end: [90], stack: [8], length: 1 },
    ]);
  });

  it('uses search strings', function() {
    const store = storeWithProfile();
    store.dispatch(changeCallTreeSearchString('javascript'));
    const stackTimingByDepth = selectedThreadSelectors.getStackTimingByDepth(
      store.getState()
    );
    expect(stackTimingByDepth).toEqual([
      { start: [60], end: [91], stack: [0], length: 1 },
      { start: [60], end: [91], stack: [1], length: 1 },
      { start: [60], end: [91], stack: [4], length: 1 },
      { start: [70], end: [90], stack: [5], length: 1 },
      { start: [80], end: [90], stack: [6], length: 1 },
      { start: [80], end: [90], stack: [7], length: 1 },
      { start: [80], end: [90], stack: [8], length: 1 },
    ]);
  });

  /**
   * The inverted stack indices will not match this chart, as new indices will be
   * generated by the function that inverts the profile information.
   *
   *            Uninverted             ->             Inverted
   *   0-10-20-30-40-50-60-70-80-90-91      0-10-20-30-40-50-60-70-80-90-91 <- Timing (ms)
   *  ================================     ================================
   *  0P 0P 0P 0P 0P 0P 0P 0P 0P 0P  |     1P 2P 2P 3P 0P 1P 4J 5P 8J 4J
   *  1P 1P 1P 1P    1P 1P 1P 1P 1P  |     0P 1P 1P 1P    0P 1P 4P 7P 1P
   *     2P 2P 3P       4J 4J 4J 4J  |        0P 0P 0P       0P 1J 6P 0P
   *                       5J 5J     |                          0P 5J
   *                          6P     |                             4J
   *                          7P     |                             1P
   *                          8J     |                             0P
   */

  it('can handle inverted stacks', function() {
    const store = storeWithProfile();
    store.dispatch(changeInvertCallstack(true));
    const stackTimingByDepth = selectedThreadSelectors.getStackTimingByDepth(
      store.getState()
    );
    expect(stackTimingByDepth).toEqual([
      {
        start: [0, 10, 30, 40, 50, 60, 70, 80, 90],
        end: [10, 30, 40, 50, 60, 70, 80, 90, 91],
        stack: [0, 2, 5, 8, 0, 9, 12, 16, 9],
        length: 9,
      },
      {
        start: [0, 10, 30, 50, 60, 70, 80, 90],
        end: [10, 30, 40, 60, 70, 80, 90, 91],
        stack: [1, 3, 6, 1, 10, 13, 17, 10],
        length: 8,
      },
      {
        start: [10, 30, 60, 70, 80, 90],
        end: [30, 40, 70, 80, 90, 91],
        stack: [4, 7, 11, 14, 18, 11],
        length: 6,
      },
      {
        start: [70, 80],
        end: [80, 90],
        stack: [15, 19],
        length: 2,
      },
      { start: [80], end: [90], stack: [20], length: 1 },
      { start: [80], end: [90], stack: [21], length: 1 },
      { start: [80], end: [90], stack: [22], length: 1 },
    ]);
  });
});

describe('selectors/getFlameGraphTiming', function() {
  /**
   * Map the flameGraphTiming data structure into a human readable format where
   * each line takes the form:
   *
   * "FunctionName1 (StartTime:EndTime) | FunctionName2 (StartTime:EndTime)"
   */
  function getHumanReadableFlameGraphRanges(store, funcNames) {
    const { callNodeTable } = selectedThreadSelectors.getCallNodeInfo(
      store.getState()
    );
    const flameGraphTiming = selectedThreadSelectors.getFlameGraphTiming(
      store.getState()
    );

    return flameGraphTiming.map(({ callNode, end, length, start }) => {
      const lines = [];
      for (let i = 0; i < length; i++) {
        const callNodeIndex = callNode[i];
        const funcIndex = callNodeTable.func[callNodeIndex];
        const funcName = funcNames[funcIndex];
        lines.push(
          `${funcName} (${parseFloat(start[i].toFixed(2))}:${parseFloat(
            end[i].toFixed(2)
          )})`
        );
      }
      return lines.join(' | ');
    });
  }

  /**
   * Map the flameGraphTiming data structure into a human readable format where
   * each line takes the form:
   *
   * "FunctionName1 (SelfTimeRelative) | ..."
   */
  function getHumanReadableFlameGraphTimings(store, funcNames) {
    const { callNodeTable } = selectedThreadSelectors.getCallNodeInfo(
      store.getState()
    );
    const flameGraphTiming = selectedThreadSelectors.getFlameGraphTiming(
      store.getState()
    );

    return flameGraphTiming.map(({ selfTimeRelative, callNode, length }) => {
      const lines = [];
      for (let i = 0; i < length; i++) {
        const callNodeIndex = callNode[i];
        const funcIndex = callNodeTable.func[callNodeIndex];
        const funcName = funcNames[funcIndex];
        lines.push(`${funcName} (${selfTimeRelative[i]})`);
      }
      return lines.join(' | ');
    });
  }

  it('computes a basic example', function() {
    const {
      profile,
      funcNamesPerThread: [funcNames],
    } = getProfileFromTextSamples(`
      A  A  A
      B  B  B
      C  C  H
      D  F  I
      E  G
    `);

    const store = storeWithProfile(profile);
    expect(getHumanReadableFlameGraphRanges(store, funcNames)).toEqual([
      'A (0:1)',
      'B (0:1)',
      'C (0:0.67) | H (0.67:1)',
      'D (0:0.33) | F (0.33:0.67) | I (0.67:1)',
      'E (0:0.33) | G (0.33:0.67)',
    ]);
  });

  it('can handle null samples', function() {
    const {
      profile,
      funcNamesPerThread: [funcNames],
    } = getProfileFromTextSamples(`
      A  A  X  A
      B  B     B
      C  C     H
      D  F     I
      E  G
    `);

    // Remove the X sample by setting it's stack to null.
    profile.threads[0].samples.stack[2] = null;

    const store = storeWithProfile(profile);
    expect(getHumanReadableFlameGraphRanges(store, funcNames)).toEqual([
      'A (0:1)',
      'B (0:1)',
      'C (0:0.67) | H (0.67:1)',
      'D (0:0.33) | F (0.33:0.67) | I (0.67:1)',
      'E (0:0.33) | G (0.33:0.67)',
    ]);
  });

  it('sorts stacks in alphabetical order', function() {
    const {
      profile,
      funcNamesPerThread: [funcNames],
    } = getProfileFromTextSamples(`
      D  D  A  D
      E  F  B  F
            C  G
    `);

    const store = storeWithProfile(profile);
    expect(getHumanReadableFlameGraphRanges(store, funcNames)).toEqual([
      'A (0:0.25) | D (0.25:1)',
      'B (0:0.25) | E (0.25:0.5) | F (0.5:1)',
      'C (0:0.25) | G (0.5:0.75)',
    ]);
  });

  it('contains totalTime, selfTime and selfTimeRelative', function() {
    const {
      profile,
      funcNamesPerThread: [funcNames],
    } = getProfileFromTextSamples(`
      A  A  A  A
      B
      C
    `);

    const store = storeWithProfile(profile);
    expect(getHumanReadableFlameGraphTimings(store, funcNames)).toEqual([
      'A (0.75)',
      'B (0)',
      'C (0.25)',
    ]);
  });
});

describe('selectors/getCallNodeMaxDepthForFlameGraph', function() {
  it('calculates the max call node depth', function() {
    const { profile } = getProfileFromTextSamples(`
      A  A  A
      B  B  B
      C  C
      D
    `);

    const store = storeWithProfile(profile);
    const allSamplesMaxDepth = selectedThreadSelectors.getCallNodeMaxDepthForFlameGraph(
      store.getState()
    );
    expect(allSamplesMaxDepth).toEqual(4);
  });

  it('returns zero if there are no samples', function() {
    const { profile } = getProfileFromTextSamples(` `);
    const store = storeWithProfile(profile);
    const allSamplesMaxDepth = selectedThreadSelectors.getCallNodeMaxDepthForFlameGraph(
      store.getState()
    );
    expect(allSamplesMaxDepth).toEqual(0);
  });
});

describe('actions/changeImplementationFilter', function() {
  const store = storeWithProfile();

  it('is initially set to filter to all', function() {
    const filter = UrlStateSelectors.getImplementationFilter(store.getState());
    expect(filter).toEqual('combined');
  });

  it('can be changed to cpp', function() {
    store.dispatch(changeImplementationFilter('cpp'));
    const filter = UrlStateSelectors.getImplementationFilter(store.getState());
    expect(filter).toEqual('cpp');
  });
});

describe('actions/updatePreviewSelection', function() {
  it('can update the selection with new values', function() {
    const store = storeWithProfile();

    const initialSelection = ProfileViewSelectors.getPreviewSelection(
      store.getState()
    );
    expect(initialSelection).toEqual({
      hasSelection: false,
      isModifying: false,
    });

    store.dispatch(
      updatePreviewSelection({
        hasSelection: true,
        isModifying: false,
        selectionStart: 100,
        selectionEnd: 200,
      })
    );

    const secondSelection = ProfileViewSelectors.getPreviewSelection(
      store.getState()
    );
    expect(secondSelection).toEqual({
      hasSelection: true,
      isModifying: false,
      selectionStart: 100,
      selectionEnd: 200,
    });
  });
});

describe('actions/changeInvertCallstack', function() {
  // This profile has a heavily weighted path of A, B, I, J that should be selected.
  const {
    profile,
    funcNamesPerThread: [funcNames],
  } = getProfileFromTextSamples(`
      A  A  A  A  A
      B  E  B  B  B
      C  F  I  I  I
      D  G  J  J  J
         H
    `);
  const toFuncIndex = funcName => funcNames.indexOf(funcName);
  const threadIndex = 0;

  // The assumptions in this tests is that we are going between these two call node
  // paths, one uninverted, the other inverted:
  const callNodePath = ['A', 'B'].map(toFuncIndex);
  const invertedCallNodePath = ['J', 'I', 'B'].map(toFuncIndex);

  // Make tests more readable by grabbing the relevant paths, and transforming
  // them to their function names, rather than indexes.
  const getPaths = state => ({
    selectedCallNodePath: selectedThreadSelectors
      .getSelectedCallNodePath(state)
      .map(index => funcNames[index]),
    expandedCallNodePaths: Array.from(
      selectedThreadSelectors.getExpandedCallNodePaths(state)
    ).map(path => path.map(index => funcNames[index])),
  });

  describe('on a normal call tree', function() {
    // Each test uses a normal call tree, with a selected call node.
    const storeWithNormalCallTree = () => {
      const store = storeWithProfile(profile);
      store.dispatch(changeSelectedCallNode(threadIndex, callNodePath));
      return store;
    };

    it('starts with a selectedCallNodePath', function() {
      const { getState } = storeWithNormalCallTree();
      const { selectedCallNodePath, expandedCallNodePaths } = getPaths(
        getState()
      );
      expect(selectedCallNodePath).toEqual(['A', 'B']);
      expect(expandedCallNodePaths).toEqual([['A']]);
    });

    it('inverts the selectedCallNodePath', function() {
      const { dispatch, getState } = storeWithProfile(profile);
      dispatch(changeSelectedCallNode(threadIndex, callNodePath));
      dispatch(changeInvertCallstack(true));
      const { selectedCallNodePath, expandedCallNodePaths } = getPaths(
        getState()
      );

      // Do not select the first alphabetical path:
      expect(selectedCallNodePath).not.toEqual(['D', 'C', 'B']);

      // Pick the heaviest path:
      expect(selectedCallNodePath).toEqual(['J', 'I', 'B']);
      expect(expandedCallNodePaths).toEqual([['J'], ['J', 'I']]);
    });
  });

  describe('on an inverted call tree', function() {
    // Each test uses a store with an inverted profile, and a selected call node.
    const storeWithInvertedCallTree = () => {
      const store = storeWithProfile(profile);
      store.dispatch(changeInvertCallstack(true));
      store.dispatch(changeSelectedCallNode(threadIndex, invertedCallNodePath));
      return store;
    };

    it('starts with a selectedCallNodePath', function() {
      const { getState } = storeWithInvertedCallTree();
      const { selectedCallNodePath, expandedCallNodePaths } = getPaths(
        getState()
      );
      expect(selectedCallNodePath).toEqual(['J', 'I', 'B']);
      expect(expandedCallNodePaths).toEqual([['J'], ['J', 'I']]);
    });

    it('uninverts the selectedCallNodePath', function() {
      const { dispatch, getState } = storeWithInvertedCallTree();
      dispatch(changeInvertCallstack(false));
      const { selectedCallNodePath, expandedCallNodePaths } = getPaths(
        getState()
      );

      expect(selectedCallNodePath).toEqual(['A', 'B']);
      expect(expandedCallNodePaths).toEqual([['A']]);
    });
  });
});

describe('actions/changeShowJsTracerSummary', function() {
  it('can change the view to show a summary', function() {
    const { profile } = getProfileFromTextSamples(`A`);
    const { dispatch, getState } = storeWithProfile(profile);
    expect(UrlStateSelectors.getShowJsTracerSummary(getState())).toBe(false);
    dispatch(changeShowJsTracerSummary(true));
    expect(UrlStateSelectors.getShowJsTracerSummary(getState())).toBe(true);
  });
});
