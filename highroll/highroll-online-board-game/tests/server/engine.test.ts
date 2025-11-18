/** @jest-environment node */
import GameEngine from '../../src/server/game/engine';
import type { GameState } from '../../src/shared/types';

describe('GameEngine', () => {
    const matchId = 'match-test';
    const defaultRole = 'swiftwind';
    const alternateRole = 'anger';

    it('initializes with waiting status', () => {
        const engine = new GameEngine(matchId);
        const state = engine.getState();

        expect(state.status).toBe('waiting');
        expect(state.players).toHaveLength(0);
        expect(state.id).toBe(matchId);
    });

    it('allows players to join and marks them ready', () => {
        const engine = new GameEngine(matchId);
        const player = engine.addPlayer('Alice');

        engine.markPlayerReady(player.id, true);

        const state = engine.getState();

        expect(state.players).toHaveLength(1);
        expect(state.players[0].isReady).toBe(true);
    });

    it('starts the game when all players are ready', () => {
        const engine = new GameEngine(matchId);
        const alice = engine.addPlayer('Alice');
        const bob = engine.addPlayer('Bob');
        engine.setPlayerRole(alice.id, defaultRole);
        engine.setPlayerRole(bob.id, defaultRole);

        engine.markPlayerReady(alice.id, true);
        engine.markPlayerReady(bob.id, true);

        engine.start();

        expect(engine.isActive()).toBe(true);
        expect(engine.getState().status).toBe('inProgress');
    });

    it('throws if attempting to start when players are not ready', () => {
        const engine = new GameEngine(matchId);
        engine.addPlayer('Alice');
        engine.setPlayerRole(engine.getState().players[0].id, defaultRole);

        expect(() => engine.start()).toThrow('All players must be ready');
    });

    it('ends the game and stores winner when provided', () => {
        const engine = new GameEngine(matchId);
        const alice = engine.addPlayer('Alice');
        const bob = engine.addPlayer('Bob');
        engine.setPlayerRole(alice.id, defaultRole);
        engine.setPlayerRole(bob.id, defaultRole);

        engine.markPlayerReady(alice.id, true);
        engine.markPlayerReady(bob.id, true);
        engine.start();

        engine.end(alice.id);

        const state = engine.getState();
        expect(state.status).toBe('finished');
        expect(state.winnerId).toBe(alice.id);
    });

    it('applies damage when casting attack cards', () => {
        const engine = new GameEngine(matchId);
        const alice = engine.addPlayer('Alice');
        const bob = engine.addPlayer('Bob');
        engine.setPlayerRole(alice.id, defaultRole);
        engine.setPlayerRole(bob.id, alternateRole);
        engine.assignSharedDeck('test-deck', Array(10).fill('jab'));
        engine.markPlayerReady(alice.id, true);
        engine.markPlayerReady(bob.id, true);
        engine.start();

        engine.playCard(alice.id, 'jab', { targets: [bob.id] });

        const bobState = engine.getState().board.playerStates[bob.id];
        expect(bobState).toBeDefined();
        expect(bobState.hp).toBeLessThan(bobState.maxHp);
        expect(bobState.hp).toBe(17);
    });

    it('grants stat tokens when buff cards resolve', () => {
        const engine = new GameEngine(matchId);
        const alice = engine.addPlayer('Alice');
        const bob = engine.addPlayer('Bob');
        engine.setPlayerRole(alice.id, defaultRole);
        engine.setPlayerRole(bob.id, alternateRole);
        engine.assignSharedDeck('test-buff', Array(10).fill('wind_veil'));
        engine.markPlayerReady(alice.id, true);
        engine.markPlayerReady(bob.id, true);
        engine.start();

        engine.playCard(alice.id, 'wind_veil');

        const aliceState = engine.getState().board.playerStates[alice.id];
        expect(aliceState).toBeDefined();
        expect(aliceState.statTokens.def).toBeGreaterThanOrEqual(4);
    });

    it('performs role attacks and logs the result', () => {
        const engine = new GameEngine(matchId);
        const alice = engine.addPlayer('Alice');
        const bob = engine.addPlayer('Bob');
        engine.setPlayerRole(alice.id, defaultRole);
        engine.setPlayerRole(bob.id, alternateRole);
        engine.assignSharedDeck('test', Array(10).fill('jab'));
        engine.markPlayerReady(alice.id, true);
        engine.markPlayerReady(bob.id, true);
        engine.start();

        const attackerId = engine.getState().currentPlayerId ?? engine.getState().turnOrder[engine.getState().currentTurn];
        const defenderId = engine.getState().players.find((p) => p.id !== attackerId)?.id;
        expect(attackerId).toBeDefined();
        expect(defenderId).toBeDefined();

        const startingBra = engine.getState().braTokens[attackerId!];
        engine.roleAttack(attackerId!, defenderId!);
        const updated = engine.getState();
        expect(updated.roleAttackUsed[attackerId!]).toBe(true);
        expect(updated.logs.some((entry) => entry.type === 'roleAttack')).toBe(true);
        expect(updated.braTokens[attackerId!]).toBe(Math.max(0, (startingBra ?? 0) - 1));
    });

    it('allows struggle attacks when Bra is zero and ends the turn', () => {
        const engine = new GameEngine(matchId);
        const alice = engine.addPlayer('Alice');
        const bob = engine.addPlayer('Bob');
        engine.setPlayerRole(alice.id, defaultRole);
        engine.setPlayerRole(bob.id, alternateRole);
        engine.assignSharedDeck('test', Array(10).fill('jab'));
        engine.markPlayerReady(alice.id, true);
        engine.markPlayerReady(bob.id, true);
        engine.start();

        const attackerId = engine.getState().currentPlayerId ?? engine.getState().turnOrder[engine.getState().currentTurn];
        const defenderId = engine.getState().players.find((p) => p.id !== attackerId)?.id!;
        const internal = engine as unknown as { state: GameState };
        const beforeHp = internal.state.board.playerStates[attackerId!].hp;
        internal.state = {
            ...internal.state,
            braTokens: {
                ...internal.state.braTokens,
                [attackerId!]: 0,
            },
        };

        engine.roleAttack(attackerId!, defenderId, { struggle: true });

        const after = engine.getState();
        expect(after.board.playerStates[attackerId!].hp).toBeLessThan(beforeHp);
        expect(after.roleAttackUsed[attackerId!]).toBe(true);
        expect(after.currentPlayerId).not.toBe(attackerId);
    });

    it('eliminates players at 0 HP and ends the match when one remains', () => {
        const engine = new GameEngine(matchId);
        const alice = engine.addPlayer('Alice');
        const bob = engine.addPlayer('Bob');
        engine.setPlayerRole(alice.id, defaultRole);
        engine.setPlayerRole(bob.id, alternateRole);
        engine.assignSharedDeck('test', Array(10).fill('jab'));
        engine.markPlayerReady(alice.id, true);
        engine.markPlayerReady(bob.id, true);
        engine.start();

        const internal = engine as unknown as { state: GameState };
        internal.state.board.playerStates[bob.id].hp = 1;

        engine.roleAttack(alice.id, bob.id);

        const finalState = engine.getState();
        expect(finalState.board.playerStates[bob.id].isDefeated).toBe(true);
        expect(finalState.status).toBe('finished');
        expect(finalState.winnerId).toBe(alice.id);
        expect(finalState.logs.some((entry) => entry.type === 'playerDefeated')).toBe(true);
    });

    describe('role abilities', () => {
        it('applies swiftwind bonuses on attacks and stat thresholds', () => {
            const engine = new GameEngine(matchId);
            const swift = engine.addPlayer('Swift');
            const target = engine.addPlayer('Target');
            engine.setPlayerRole(swift.id, 'swiftwind');
            engine.setPlayerRole(target.id, 'anger');
            engine.assignSharedDeck('test-deck', Array(10).fill('jab'));
            engine.markPlayerReady(swift.id, true);
            engine.markPlayerReady(target.id, true);
            engine.start();

            const internal = engine as unknown as { state: GameState };
            internal.state.board.playerStates[swift.id].statTokens.spe = 1;

            engine.roleAttack(swift.id, target.id);

            const swiftState = engine.getState().board.playerStates[swift.id];
            expect(swiftState.statTokens.spe).toBe(2);
            expect(swiftState.statTokens.bra).toBeGreaterThanOrEqual(1);
        });

        it('lets swiftwind spend speed tokens to reduce incoming damage', () => {
            const engine = new GameEngine(matchId);
            const swift = engine.addPlayer('Swift');
            const target = engine.addPlayer('Target');
            engine.setPlayerRole(swift.id, 'swiftwind');
            engine.setPlayerRole(target.id, 'anger');
            engine.assignSharedDeck('test-deck', Array(10).fill('jab'));
            engine.markPlayerReady(swift.id, true);
            engine.markPlayerReady(target.id, true);
            engine.start();

            const internal = engine as unknown as { state: GameState };
            internal.state.board.playerStates[swift.id].statTokens.spe = 3;

            engine.endTurn(swift.id);
            engine.roleAttack(target.id, swift.id);

            const swiftState = engine.getState().board.playerStates[swift.id];
            expect(swiftState.statTokens.spe).toBe(0);
            expect(swiftState.hp).toBe(13);
        });

        it('grants anger attack tokens equal to received damage', () => {
            const engine = new GameEngine(matchId);
            const swift = engine.addPlayer('Swift');
            const anger = engine.addPlayer('Anger');
            engine.setPlayerRole(swift.id, 'swiftwind');
            engine.setPlayerRole(anger.id, 'anger');
            engine.assignSharedDeck('test-deck', Array(10).fill('jab'));
            engine.markPlayerReady(swift.id, true);
            engine.markPlayerReady(anger.id, true);
            engine.start();

            engine.roleAttack(swift.id, anger.id);

            const angerState = engine.getState().board.playerStates[anger.id];
            expect(angerState.statTokens.atk).toBe(5);
        });

        it('applies the monster duel curse when only two players remain', () => {
            const engine = new GameEngine(matchId);
            const monster = engine.addPlayer('Monster');
            const swift = engine.addPlayer('Swift');
            const anger = engine.addPlayer('Anger');
            engine.setPlayerRole(monster.id, 'monster');
            engine.setPlayerRole(swift.id, 'swiftwind');
            engine.setPlayerRole(anger.id, 'anger');
            engine.assignSharedDeck('test-deck', Array(10).fill('jab'));
            engine.markPlayerReady(monster.id, true);
            engine.markPlayerReady(swift.id, true);
            engine.markPlayerReady(anger.id, true);
            engine.start();

            const internal = engine as unknown as { state: GameState };
            internal.state.board.playerStates[anger.id].hp = 1;

            engine.roleAttack(swift.id, anger.id);

            const monsterState = engine.getState().board.playerStates[monster.id];
            expect(monsterState.baseStats.hp).toBe(1);
            expect(monsterState.maxHp).toBe(1);
            expect(monsterState.hp).toBe(1);
        });

        it('causes bomb to self-damage and reflect damage onto attackers', () => {
            const engine = new GameEngine(matchId);
            const bomb = engine.addPlayer('Bomb');
            const anger = engine.addPlayer('Anger');
            engine.setPlayerRole(bomb.id, 'bomb');
            engine.setPlayerRole(anger.id, 'anger');
            engine.assignSharedDeck('test-deck', Array(10).fill('jab'));
            engine.markPlayerReady(bomb.id, true);
            engine.markPlayerReady(anger.id, true);
            engine.start();

            engine.roleAttack(bomb.id, anger.id);

            let bombState = engine.getState().board.playerStates[bomb.id];
            let angerState = engine.getState().board.playerStates[anger.id];
            expect(angerState.hp).toBe(12);
            expect(bombState.hp).toBe(16);

            engine.endTurn(bomb.id);
            engine.roleAttack(anger.id, bomb.id);

            bombState = engine.getState().board.playerStates[bomb.id];
            angerState = engine.getState().board.playerStates[anger.id];
            expect(bombState.hp).toBe(6);
            expect(angerState.hp).toBe(7);
        });

        it('rewards murderer with stat tokens after a kill', () => {
            const engine = new GameEngine(matchId);
            const murderer = engine.addPlayer('Murderer');
            const victim = engine.addPlayer('Victim');
            engine.setPlayerRole(murderer.id, 'murderer');
            engine.setPlayerRole(victim.id, 'anger');
            engine.assignSharedDeck('test-deck', Array(10).fill('jab'));
            engine.markPlayerReady(murderer.id, true);
            engine.markPlayerReady(victim.id, true);
            engine.start();

            const internal = engine as unknown as { state: GameState };
            internal.state.board.playerStates[victim.id].hp = 1;

            engine.roleAttack(murderer.id, victim.id);

            const murdererState = engine.getState().board.playerStates[murderer.id];
            expect(murdererState.statTokens.atk).toBe(1);
            expect(murdererState.statTokens.spe).toBe(1);
            expect(murdererState.statTokens.bra).toBe(1);
        });
    });

    describe('role actions', () => {
        const rotateTo = (engine: GameEngine, playerId: string) => {
            let guard = 10;
            while (engine.getState().currentPlayerId !== playerId && guard > 0) {
                const current = engine.getState().currentPlayerId ?? engine.getState().turnOrder[engine.getState().currentTurn];
                if (!current) break;
                engine.endTurn(current);
                guard -= 1;
            }
        };

        it('accumulates charge for discharge and applies shock tokens', () => {
            const engine = new GameEngine(matchId);
            const discharge = engine.addPlayer('Spark');
            const target = engine.addPlayer('Dummy');
            engine.setPlayerRole(discharge.id, 'discharge');
            engine.setPlayerRole(target.id, 'anger');
            engine.assignSharedDeck('test-deck', Array(10).fill('jab'));
            engine.markPlayerReady(discharge.id, true);
            engine.markPlayerReady(target.id, true);
            engine.start();

            rotateTo(engine, discharge.id);
            const internal = engine as unknown as { state: GameState };
            internal.state.braTokens[discharge.id] = 3;
            engine.endTurn(discharge.id);
            expect(engine.getState().board.playerStates[discharge.id].roleState?.chargeTokens).toBe(3);

            rotateTo(engine, discharge.id);
            engine.roleAction(discharge.id, 'discharge_release');
            expect(engine.getState().board.playerStates[target.id].roleState?.shockTokens).toBe(9);

            engine.endTurn(discharge.id);
            const victimRuntime = engine.getState().board.playerStates[target.id];
            const baseBra = victimRuntime.baseStats.bra;
            expect(engine.getState().braTokens[target.id]).toBe(Math.max(0, baseBra - 1));
            expect(victimRuntime.roleState?.shockTokens).toBe(4);
        });

        it('executes doctor actions', () => {
            const engine = new GameEngine(matchId);
            const doctor = engine.addPlayer('Doctor');
            const patient = engine.addPlayer('Patient');
            engine.setPlayerRole(doctor.id, 'doctor');
            engine.setPlayerRole(patient.id, 'anger');
            engine.assignSharedDeck('test-deck', Array(10).fill('jab'));
            engine.markPlayerReady(doctor.id, true);
            engine.markPlayerReady(patient.id, true);
            engine.start();

            rotateTo(engine, doctor.id);
            const internal = engine as unknown as { state: GameState };
            internal.state.board.playerStates[patient.id].hp = 10;

            internal.state.braTokens[doctor.id] = 1;
            engine.roleAction(doctor.id, 'doctor_heal', { targetId: patient.id });
            expect(engine.getState().board.playerStates[patient.id].hp).toBe(13);

            internal.state.braTokens[doctor.id] = 1;
            engine.roleAction(doctor.id, 'doctor_anesthesia', { targetId: patient.id });
            expect(engine.getState().board.playerStates[patient.id].roleState?.pendingBraPenalty).toBe(1);

            internal.state.braTokens[doctor.id] = 1;
            engine.roleAction(doctor.id, 'doctor_surgery', { targetId: patient.id });
            expect(engine.getState().board.playerStates[patient.id].roleState?.surgeryPhase).toBe('immobilize');

            internal.state.braTokens[doctor.id] = 1;
            engine.roleAction(doctor.id, 'doctor_reshape', {
                targetId: patient.id,
                choices: { statDown: 'atk', statUp: 'def' },
            });
            const reshaped = engine.getState().board.playerStates[patient.id];
            expect(reshaped.baseStats.atk).toBe(12);
            expect(reshaped.baseStats.def).toBe(1);

            engine.endTurn(doctor.id);
            const afterSkip = engine.getState().board.playerStates[patient.id];
            expect(afterSkip.roleState?.surgeryPhase).toBe('heal');
            expect(engine.getState().braTokens[patient.id]).toBe(0);

            engine.endTurn(doctor.id);
            const healed = engine.getState().board.playerStates[patient.id];
            expect(healed.hp).toBe(20);
            expect(healed.roleState?.surgeryPhase).toBeUndefined();
        });
    });
});
