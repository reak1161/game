import {
  applyAiRoundDecisionWithFrames,
  chooseRoundBuff,
  createLocalGame,
  finalizeRound,
  planAiRound,
  type LocalGameState
} from "@hyperdimensional-battle/engine";
import { sampleCards, sampleRoles, sampleRoundBuffs } from "@hyperdimensional-battle/shared";
import type { AiLevel } from "./multiplayer";

type SoloAiReplayRequest = {
  roleId: string;
  seed: string;
  level: AiLevel;
};

type SoloAiReplayResponse = {
  type?: "progress" | "round_complete" | "complete";
  round?: number;
  completedRounds?: number;
  processedPlans?: number;
  totalPlans?: number;
  explorationPercent?: number;
  message?: string;
  game?: LocalGameState;
  frames?: LocalGameState[];
  error?: string;
};

self.addEventListener("message", async (event: MessageEvent<SoloAiReplayRequest>) => {
  try {
    let game = createLocalGame({
      roleId: event.data.roleId,
      cards: sampleCards,
      roles: sampleRoles,
      roundBuffs: sampleRoundBuffs,
      seed: event.data.seed
    });
    const frames: LocalGameState[] = [structuredClone(game)];

    while (game.phase !== "finished") {
      const currentRound = game.round;
      self.postMessage({
        type: "progress",
        round: currentRound,
        completedRounds: currentRound - 1,
        message: `第${currentRound}ラウンドの配置を考えています…`
      } satisfies SoloAiReplayResponse);
      const decision = planAiRound(game, event.data.level, (progress) => {
        self.postMessage({
          type: "progress",
          round: currentRound,
          completedRounds: currentRound - 1,
          processedPlans: progress.processedPlans,
          totalPlans: progress.totalPlans,
          explorationPercent: progress.percent,
          message: `第${currentRound}ラウンドの配置を探索しています…`
        } satisfies SoloAiReplayResponse);
      });
      const roundResult = applyAiRoundDecisionWithFrames(game, decision);
      game = roundResult.state;
      frames.push(...roundResult.frames);
      self.postMessage({
        type: "progress",
        round: currentRound,
        completedRounds: currentRound - 1,
        message: `第${currentRound}ラウンドの終了処理を進めています…`
      } satisfies SoloAiReplayResponse);
      if (game.phase === "round_end" && !game.pendingFinalAction) {
        game = finalizeRound(game, game.players[0]!.field.slice(0, 2).map((card) => card.instanceId));
        frames.push(structuredClone(game));
        if (game.pendingRoundBuffChoice) {
          game = chooseRoundBuff(game, 0);
          frames.push(structuredClone(game));
        }
      }
      self.postMessage({
        type: "progress",
        round: Math.min(currentRound + 1, 5),
        completedRounds: currentRound,
        message: currentRound >= 5 ? "リプレイを準備しています…" : `第${currentRound}ラウンドが完了しました。`
      } satisfies SoloAiReplayResponse);
      self.postMessage({
        type: "round_complete",
        round: Math.min(currentRound + 1, 5),
        completedRounds: currentRound,
        game,
        frames
      } satisfies SoloAiReplayResponse);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }

    self.postMessage({ type: "complete", game, frames } satisfies SoloAiReplayResponse);
  } catch (caught) {
    self.postMessage({
      error: caught instanceof Error ? caught.message : "AIリプレイを生成できませんでした。"
    } satisfies SoloAiReplayResponse);
  }
});
