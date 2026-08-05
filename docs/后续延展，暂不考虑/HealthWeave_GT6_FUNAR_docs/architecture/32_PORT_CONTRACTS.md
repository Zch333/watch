# 端口契约

## 1. PlatformHealthPort

```ts
interface PlatformHealthPort {
  capabilities(): Promise<CapabilityReport>
  requestAuthorization(scopes: DataScope[]): Promise<AuthorizationResult>
  read(request: ReadRequest): AsyncIterable<RawPlatformRecord>
  changes(cursor?: SyncCursor): AsyncIterable<RawPlatformChange>
  revoke(scopes: DataScope[]): Promise<void>
}
```

契约：重复读取不得造成领域重复；必须保留平台 ID、原始类型、时间和来源。

## 2. WatchSensorPort

```ts
interface WatchSensorPort {
  listSensors(): Promise<SensorCapability[]>
  open(session: SensorSessionRequest): AsyncIterable<SensorSample>
  close(sessionId: string): Promise<void>
}
```

契约：必须支持最大时长、采样率协商、断连和功耗元数据。

## 3. TimelineStorePort

```ts
interface TimelineStorePort {
  append(batch: Observation[]): Promise<AppendResult>
  query(query: TimelineQuery): AsyncIterable<Observation>
  tombstone(subject: SubjectId, selector: Selector): Promise<void>
  transaction<A>(work: TransactionWork<A>): Promise<A>
}
```

## 4. AlgorithmPort

```ts
interface AlgorithmPort {
  describe(id: AlgorithmId): AlgorithmDefinition
  execute(request: AlgorithmRequest): Promise<AlgorithmResult>
}
```

输入必须通过定义的能力和质量要求。

## 5. AiInferencePort

```ts
interface AiInferencePort {
  complete(envelope: AiEnvelope): Promise<UntrustedAiOutput>
}
```

端口返回的是“不可信输出”；必须经过 Schema、事实一致性和安全校验。

## 6. 其他端口

- `ClockPort`
- `CryptoPort`
- `ConsentStorePort`
- `CapabilityStorePort`
- `FeatureStorePort`
- `NotificationPort`
- `AuditPort`
- `ModelRegistryPort`
- `KnowledgeRetrievalPort`
- `ExportPort`

每个真实适配器必须通过共享契约测试。
