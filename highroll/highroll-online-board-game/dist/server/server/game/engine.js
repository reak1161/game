"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameEngine = void 0;
const gameState_1 = require("../../shared/utils/gameState");
const catalog_1 = require("../data/catalog");
class GameEngine {
    constructor(matchId, initialPlayers = []) {
        this.state = (0, gameState_1.createInitialGameState)(matchId, initialPlayers);
        this.roleMap = new Map((0, catalog_1.getRolesCatalog)().map((role) => [role.id, role]));
    }
    addPlayer(name) {
        const player = (0, gameState_1.createPlayer)(name);
        this.state = (0, gameState_1.addPlayerToState)(this.state, player);
        return player;
    }
    markPlayerReady(playerId, isReady = true) {
        this.state = (0, gameState_1.setPlayerReady)(this.state, playerId, isReady);
    }
    setPlayerRole(playerId, roleId) {
        this.state = (0, gameState_1.setPlayerRole)(this.state, playerId, roleId);
    }
    assignSharedDeck(deckId, cards) {
        this.state = (0, gameState_1.setSharedDeck)(this.state, deckId, cards);
    }
    drawCards(playerId, count) {
        if (this.state.status === 'inProgress') {
            this.assertPlayerTurn(playerId);
        }
        this.state = (0, gameState_1.drawFromSharedDeck)(this.state, playerId, count);
    }
    playCard(playerId, cardId) {
        this.assertPlayerTurn(playerId);
        this.assertBraAvailable(playerId);
        this.state = (0, gameState_1.playCardFromHand)(this.state, playerId, cardId);
        this.state = (0, gameState_1.consumeBra)(this.state, playerId, 1);
    }
    start() {
        if (this.state.players.length === 0) {
            throw new Error('At least one player is required to start the game.');
        }
        const allPlayersReady = this.state.players.every((player) => player.isReady);
        if (!allPlayersReady) {
            throw new Error('All players must be ready.');
        }
        if (!this.state.deckId) {
            throw new Error('Deck must be assigned before starting the match.');
        }
        const order = this.state.players
            .slice()
            .sort((a, b) => this.getSpe(b.roleId) - this.getSpe(a.roleId))
            .map((player) => player.id);
        this.state = (0, gameState_1.setTurnOrder)(this.state, order);
        order.forEach((playerId) => {
            this.state = (0, gameState_1.setBraTokens)(this.state, playerId, this.getBra(this.getPlayer(playerId)?.roleId));
            this.state = (0, gameState_1.drawFromSharedDeck)(this.state, playerId, 3);
        });
        this.state = (0, gameState_1.setMatchStatus)(this.state, 'inProgress');
        this.beginTurn(order[0]);
    }
    end(winnerId) {
        this.state = (0, gameState_1.setMatchStatus)(this.state, 'finished', winnerId);
    }
    endTurn(playerId) {
        this.assertPlayerTurn(playerId);
        this.state = (0, gameState_1.advanceTurnState)(this.state);
        const nextPlayerId = this.state.currentPlayerId ?? this.state.turnOrder[this.state.currentTurn];
        this.beginTurn(nextPlayerId);
    }
    applyScore(playerId, delta) {
        this.state = (0, gameState_1.updatePlayerScore)(this.state, playerId, delta);
    }
    isActive() {
        return this.state.status === 'inProgress';
    }
    getCurrentPlayer() {
        const id = this.state.currentPlayerId ?? this.state.turnOrder[this.state.currentTurn];
        return this.state.players.find((player) => player.id === id);
    }
    getState() {
        return this.state;
    }
    getSummary() {
        return {
            id: this.state.id,
            status: this.state.status,
            playerCount: this.state.players.length,
            createdAt: this.state.createdAt,
            updatedAt: this.state.updatedAt,
        };
    }
    getPlayer(id) {
        return this.state.players.find((player) => player.id === id);
    }
    getSpe(roleId) {
        if (roleId && this.roleMap.has(roleId)) {
            return this.roleMap.get(roleId)?.params.spe ?? 0;
        }
        return 0;
    }
    getBra(roleId) {
        if (roleId && this.roleMap.has(roleId)) {
            return this.roleMap.get(roleId)?.params.bra ?? 1;
        }
        return 1;
    }
    assertPlayerTurn(playerId) {
        const currentId = this.state.currentPlayerId ?? this.state.turnOrder[this.state.currentTurn];
        if (currentId !== playerId) {
            throw new Error('Not your turn.');
        }
    }
    assertBraAvailable(playerId) {
        const remaining = this.state.braTokens[playerId] ?? 0;
        if (remaining <= 0) {
            throw new Error('No Bra remaining.');
        }
    }
    beginTurn(playerId) {
        if (!playerId) {
            return;
        }
        this.state = (0, gameState_1.setBraTokens)(this.state, playerId, this.getBra(this.getPlayer(playerId)?.roleId));
        this.state = (0, gameState_1.drawFromSharedDeck)(this.state, playerId, 1);
    }
}
exports.GameEngine = GameEngine;
exports.default = GameEngine;
