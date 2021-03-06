/**
 * Store
 *
 * Stores hold application state. They respond to actions sent by the dispatcher
 * and broadcast change events to listeners, so they can grab the latest data.
 * The key thing to remember is that the only way stores receive information
 * from the outside world is via the dispatcher.
 */

import EventEmitter from 'eventemitter3';
import assign from 'object-assign';

export default class Store extends EventEmitter {

  /**
   * Stores are initialized with a reference
   * @type {Object}
   */
  constructor() {
    this.state = undefined;

    this._handlers = {};
    this._asyncHandlers = {};
  }

  /**
   * Return a (shallow) copy of the store's internal state, so that it is
   * protected from mutation by the consumer.
   * @returns {object}
   */
  getState() {
    return assign({}, this.state);
  }

  setState(newState) {
    if (typeof this.state === 'undefined') this.state = {};

    if (this._isHandlingDispatch) {
      this._pendingState = assign(this._pendingState, newState);
      this._emitChangeAfterHandlingDispatch = true;
    } else {
      console.warn(
        'Store#setState() called from outside an action handler. This is likely '
      + 'a mistake. Flux stores should manage their own state.'
      );

      this.state = assign({}, this.state, newState);
      this.emit('change');
    }
  }

  replaceState(newState) {
    if (typeof this.state === 'undefined') this.state = {};

    if (this._isHandlingDispatch) {
      this._pendingState = assign({}, newState);
      this._emitChangeAfterHandlingDispatch = true;
    } else {
      this.state = assign({}, newState);
      this.emit('change');
    }
  }

  register(actionId, handler) {
    actionId = ensureActionId(actionId);

    if (typeof handler !== 'function') return;

    this._handlers[actionId] = handler.bind(this);
  }

  registerAsync(actionId, beginHandler, successHandler, failureHandler) {
    actionId = ensureActionId(actionId);

    let asyncHandlers = {
      begin: beginHandler,
      success: successHandler,
      failure: failureHandler,
    };

    for (let key in asyncHandlers) {
      if (!asyncHandlers.hasOwnProperty(key)) continue;

      let handler = asyncHandlers[key];

      if (typeof handler === 'function') {
        asyncHandlers[key] = handler.bind(this);
      } else {
        delete asyncHandlers[key];
      }
    }

    this._asyncHandlers[actionId] = asyncHandlers;
  }

  waitFor(tokensOrStores) {
    this._waitFor(tokensOrStores);
  }

  handler(payload) {
    let {
      body,
      actionId,
      async: _async,
      actionArgs,
      error
    } = payload;

    let _handler = this._handlers[actionId];
    let _asyncHandler = this._asyncHandlers[actionId]
      && this._asyncHandlers[actionId][_async];

    if (_async) {
      switch (_async) {
        case 'begin':
          if (typeof _asyncHandler === 'function') {
            this._performHandler.apply(this, [_asyncHandler].concat(actionArgs));
          }
          return;
        case 'failure':
          if (typeof _asyncHandler === 'function') {
            this._performHandler(_asyncHandler, error);
          }
          return;
        case 'success':
          if (typeof _asyncHandler === 'function') {
            _handler = _asyncHandler;
          }
          break;
        default:
          return;
      }
    }

    if (typeof _handler !== 'function') return;
    this._performHandler(_handler, body);
  }

  _performHandler(_handler, ...args) {
    this._isHandlingDispatch = true;
    this._pendingState = assign({}, this.state);
    this._emitChangeAfterHandlingDispatch = false;

    try {
      _handler.apply(this, args);
    } finally {

      if (this._emitChangeAfterHandlingDispatch) {
        this.state = this._pendingState;
        this.emit('change');
      }

      this._isHandlingDispatch = false;
      this._pendingState = {};
      this._emitChangeAfterHandlingDispatch = false;
    }
  }
}

function ensureActionId(actionOrActionId) {
  return typeof actionOrActionId === 'function'
    ? actionOrActionId._id
    : actionOrActionId;
}
