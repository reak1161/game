# 超次元バトル / Codex向け設計文書セット

このフォルダは、Webブラウザで動作するカードゲーム **「超次元バトル」** を Codex に実装させるための設計文書セットです。

## 文書一覧
- `01_product_overview.md`
  - プロダクト概要、ゲームコンセプト、開発方針
- `02_functional_requirements.md`
  - 機能要件、画面要件、非機能要件
- `03_game_rules_and_engine_spec.md`
  - ルール仕様、用語定義、効果解決エンジン仕様
- `04_architecture_do_websocket.md`
  - TypeScript / React / Cloudflare Durable Objects / WebSocket 前提の構成案
- `05_data_models_and_events.md`
  - データモデル、イベントモデル、DTO / Stateの例
- `06_codex_implementation_tasks.md`
  - Codex向けタスク分解、実装順、受け入れ条件
- `07_codex_bootstrap_prompt.md`
  - Codex に最初に渡すためのブートストラップ指示文
- `12_run_flow.md`
  - セットアップ、実行方法、確認フロー

## 想定技術スタック
- フロントエンド: React + TypeScript + Vite
- 状態管理: Zustand
- 演出: PixiJS
- 音: Howler.js
- 共有同期: Cloudflare Workers + Durable Objects + WebSocket
- ゲームエンジン: TypeScript（UIから独立した純粋ロジック層）

## 開発方針
- まず共通ゲームエンジンを作る
- その上にローカル再生UIを載せる
- 最後に Durable Objects + WebSocket でルーム共有再生を実装する
- 役職やカードはデータ追加で拡張しやすい構造にする
