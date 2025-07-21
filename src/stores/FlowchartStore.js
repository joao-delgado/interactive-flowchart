import { defineStore } from 'pinia';

export const useFlowchartStore = defineStore('flowchart', {
  state: () => ({
    // ID unique to the flowchart, used as key in localStorage
    flowchartId: 'flowchart-template',

    // nodes and their state
    flowchartNodes: {},
    currentNodeId: 'n-001',
    teasedItems: [],
    revealedItems: [],

    // narration/timestamps and their state
    narrationEnabled: true,
    narrationTimestamps: [],
    listenedTimestampIndexes: [],

    // state of playback
    playbackDuration: 0,
    playbackPosition: 0,
    playbackActive: false,
    mediaBuffering: false,

    // state of exploration during playback
    exploringDuringPlayback: false,

    // state of resumption from local storage
    storedProperties: [
      'currentNodeId',
      'teasedItems',
      'revealedItems',
      'listenedTimestampIndexes',
      'playbackPosition'
    ],
    resumedFromLocalStorage: false,
    resetActionAvailable: false
  }),
  getters: {
    // prepend 'flowchart_' to ID from user setup
    computedFlowchartId(state) {
      return 'flowchart_' + state.flowchartId;
    },
    // playback progress as percentage (with minimum value for initial progress bar visibility)
    playbackProgress(state) {
      if (state.playbackDuration !== 0 && state.playbackPosition !== 0) {
        return Math.max(Math.round(state.playbackPosition / state.playbackDuration * 1000) / 1000, 0.015);
      } else {
        return 0;
      }
    },
    // formatted playback duration (mm:ss)
    prettyPlaybackDuration(state) {
      return formatTime(state.playbackDuration);
    },
    // formatted playback position (mm:ss)
    prettyPlaybackPosition(state) {
      return formatTime(state.playbackPosition);
    },
    // current node object
    currentNode(state) {
      return state.flowchartNodes[state.currentNodeId];
    },
    // current index in narrationTimestamps based on media playback position
    currentNarrationNodeIndex(state) {
      const nextNarrationNodeIndex = state.narrationTimestamps.findIndex(event => event[0] > state.playbackPosition);

      if (nextNarrationNodeIndex === -1) {
        // no more narration events after playback position, thus return last index
        return Math.max(state.narrationTimestamps.length - 1, 0);
      } else {
        // return the current index (subsequent index minus one)
        return Math.max(nextNarrationNodeIndex - 1, 0);
      }
    },
    // current narration node ID
    currentNarrationNodeId(state) {
      if (state.narrationTimestamps.length > 0) {
        return state.narrationTimestamps[this.currentNarrationNodeIndex][1];
      } else {
        return false;
      }
    },
    // current narration node object
    currentNarrationNode(state) {
      return state.flowchartNodes[this.currentNarrationNodeId];
    },
    // determines whether current node has moved away from narration (i.e. current node differs from current narration node)
    movedAwayFromNarration(state) {
      return !state.playbackActive && state.currentNodeId !== this.currentNarrationNodeId;
    },
    // determines whether jump action is available (i.e. if jumpNarrationToNode action can be triggered from current node)
    jumpActionAvailable(state) {
      return this.movedAwayFromNarration && state.narrationTimestamps.findIndex(event => event[1] === state.currentNodeId) !== -1;
    },
    // determines whether feedback prompt is visible (revealed after threshold of revealed items has been reached)
    feedbackPromptAvailable() {
      return this.revealedItems.length >= 64;
    },
  },
  actions: {
    // fetch timestamps from public TXT (Audacity labels export)
    async fetchTimestamps() {
      fetch('timestamps.txt')
        .then(response => {
          if (!response.ok) throw Error(response.status);
          return response;
        })
        .then(response => response.text())
        .then(text => this.narrationTimestamps = this.convertTimestamps(text))
        .catch(error => {
          console.log(error);
          this.narrationTimestamps = [[0, 'n-001']];
          this.narrationEnabled = false;
        });
    },
    // convert TSV content to nested array
    convertTimestamps(text) {
      const lines = text.split('\n').slice(0, -1);

      const timestamps = lines.map(line => {
        const properties = line.split('\t');
        return [+properties[0], properties[properties.length - 1]];
      });

      return timestamps;
    },
    // save all parameters relevant for restoring the state of the chart to local storage
    saveToLocalStorage() {
      const currentState = {};

      this.storedProperties.forEach((property) => {
        currentState[property] = this[property];
      });

      localStorage.setItem(this.computedFlowchartId, JSON.stringify(currentState));
    },
    // attempt to get state from previous session
    resumeFromLocalStorage() {
      if (localStorage.getItem(this.computedFlowchartId)) {
        this.resumedFromLocalStorage = true;
        this.resetActionAvailable = true;

        const restoredState = JSON.parse(localStorage.getItem(this.computedFlowchartId));

        this.storedProperties.forEach((property) => {
          this[property] = restoredState[property];
        });
      }
    },
    // clear local storage and reload the page
    clearLocalStorageAndReload() {
      localStorage.removeItem(this.computedFlowchartId);
      location.reload();
    }
  }
});

function formatTime(seconds) {
  seconds = Math.floor(seconds);
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = (seconds % 60).toString().padStart(2, '0');

  return minutes + ':' + remainder;
}