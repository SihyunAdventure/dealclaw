# ADR: AWS notique-agent 계정 크롤러 cron 배포

상태: Proposed
날짜: 2026-04-15
관련 이슈: SIH-558
선행 이슈: SIH-553(스키마), SIH-555(SES), SIH-556(detect), SIH-557(실측)

## 맥락

- `npm run crawl`은 Playwright headful Chrome 기반. DB upsert + price_history 갱신 + detect-new-low + SES 알림 발송까지 단일 프로세스에서 수행
- 일 2회 (09:00/21:00 KST) 자동 실행 필요
- hotinbeauty는 Vercel 호스팅이나 Vercel Functions은 Playwright + Chrome 바이너리 실행 불가 (메모리·시간 한계)
- 사용자 AWS 계정 `notique-agent` 에 서브프로젝트 신설 가능

## 선택지 비교

| 옵션 | 요약 | 비용/월 | 운영 복잡도 | Playwright 적합성 |
|---|---|---|---|---|
| A. EC2 t3.small + cron | 항상 떠있는 VM + `crontab` | ~$17 | 패치 관리, 보안 그룹, SSH | ⭐⭐⭐⭐⭐ (네이티브) |
| B. ECS Fargate Scheduled Task | EventBridge → Fargate 컨테이너 | ~$1-3 (건당 2분) | IAM, Task Def, ECR | ⭐⭐⭐⭐ (container image) |
| C. Lambda 컨테이너 이미지 | EventBridge → Lambda | ~$0.1-0.5 | Layer/image, cold start | ⭐⭐⭐ (15분 하드 제한, cold start) |

## 결정: **B. ECS Fargate Scheduled Task**

### 이유
1. **비용**: 일 2회 × 2분 × 30일 = 월 120분. Fargate 0.25 vCPU/0.5GB = ~$1.2/월. EC2의 1/10
2. **운영 간소**: 서버 패치·SSH 관리 불필요. 이미지 업데이트만
3. **Playwright 호환**: Docker로 Chrome + 의존성 번들링 확정적, 실행 환경 재현성 높음
4. **확장**: 장래 컬렉션 늘어나도 타임아웃 여유 (Fargate는 시간 제한 없음, Lambda 15분 vs)
5. **노이즈 격리**: notique-agent 기존 자원과 VPC/Security Group 분리 쉬움 (전용 IAM + 전용 태스크 역할)

### 포기
- 개발 편의: EC2라면 SSH로 바로 디버그 가능. Fargate는 CloudWatch Logs로만 관찰 (초기 셋업 시 불편)
- Cold start: 크롤 시작까지 10-20초 추가 (허용 가능)

## 아키텍처

```
EventBridge Rule (cron 0 0 12,0 ? * *)  ← 09:00/21:00 KST = 00:00/12:00 UTC
    ↓
ECS Task Definition "hotinbeauty-crawler"
    ↓
Fargate Task (0.25 vCPU, 0.5 GB)
    ↓
ECR image "hotinbeauty-crawler:latest"
    ├─ /app/src/scripts/run-crawl.ts (tsx)
    ├─ Playwright + Chromium
    └─ entrypoint.sh
         ↓
     ┌── Neon Postgres (DATABASE_URL)
     ├── AWS SES (HIB_AWS_SES_*)
     └── CloudWatch Logs (/ecs/hotinbeauty-crawler)

실패 알림: CloudWatch Alarm → SNS topic → 본인 이메일
```

## 배포 순서 (사용자 수동 작업)

1. **ECR 리포 생성**: `hotinbeauty-crawler`
2. **이미지 빌드·푸시**:
   ```bash
   aws ecr get-login-password --region ap-northeast-2 | \
     docker login --username AWS --password-stdin <ACCOUNT>.dkr.ecr.ap-northeast-2.amazonaws.com
   docker buildx build --platform linux/amd64 -t hotinbeauty-crawler .
   docker tag hotinbeauty-crawler:latest <ACCOUNT>.dkr.ecr.ap-northeast-2.amazonaws.com/hotinbeauty-crawler:latest
   docker push <ACCOUNT>.dkr.ecr.ap-northeast-2.amazonaws.com/hotinbeauty-crawler:latest
   ```
3. **Secrets Manager** 에 env 주입:
   - `hotinbeauty/DATABASE_URL`
   - `hotinbeauty/HIB_AWS_SES_*`
   - `hotinbeauty/EMAIL_FROM`
   - `hotinbeauty/HIB_BUSINESS_*`
4. **IAM 역할 2개**:
   - `hotinbeauty-crawler-task-role`: `ses:SendEmail`, `secretsmanager:GetSecretValue`
   - `hotinbeauty-crawler-execution-role`: `AmazonECSTaskExecutionRolePolicy` + `secretsmanager:GetSecretValue`
5. **ECS Cluster**: 기존 공유 or 신규 `hotinbeauty-cluster` (Fargate)
6. **Task Definition**:
   - 컨테이너: ECR 이미지
   - 0.25 vCPU / 0.5 GB
   - environment: `EMAIL_DRY_RUN=0`
   - secrets: Secrets Manager 참조
   - 로그: `awslogs` 드라이버 → `/ecs/hotinbeauty-crawler`
7. **EventBridge Rule**:
   - Schedule: `cron(0 0,12 * * ? *)` (UTC, KST 09:00/21:00)
   - Target: ECS Run Task → 위 Task Definition
8. **CloudWatch Alarm**:
   - 실패 시 SNS → 본인 이메일

## 운영 러닝북

### 수동 재실행
```bash
aws ecs run-task \
  --cluster hotinbeauty-cluster \
  --task-definition hotinbeauty-crawler \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],assignPublicIp=ENABLED}"
```

### 로그 확인
```bash
aws logs tail /ecs/hotinbeauty-crawler --follow
```

### 이미지 업데이트 후 재배포
1. `docker buildx build ... && docker push`
2. ECS Task Definition 새 리비전 생성 (CLI: `aws ecs register-task-definition`)
3. EventBridge Target의 taskDefinition 업데이트

## 위험 & 대응

| 위험 | 대응 |
|---|---|
| 쿠팡 Access Denied | `run-crawl.ts` 이미 탐지, crawl_runs.status=failed 기록, CloudWatch Alarm |
| Playwright Chrome 크래시 | Task 재시작 자동, 단 2회 연속 실패 시 알림 |
| Neon DB 일시 장애 | 트랜잭션 롤백 + crawl_run 로그, 다음 스케줄에 재시도 |
| SES 발송 실패 | subscription.lastNotifiedAt 갱신 실패 → 다음 크롤에서 재시도 (쿨다운 24h 내라 중복 발송 없음) |
| Playwright 이미지 비대 (~1GB) | ECR 비용 미미. Fargate pull 시간 ~15초 |

## 대안 차후 재검토

- **Lambda로 이전**: 크롤 시간이 안정적으로 10분 이하면 비용 1/10
- **EKS/Kubernetes**: 불필요, 단일 크론잡은 오버엔지니어링
- **Self-hosted**: 맥미니 등 — Fargate 실패 시 백업으로만 고려

## 다음 단계 (이 PR 이후)

1. Dockerfile·entrypoint·.dockerignore 레포에 커밋 (이 PR)
2. 사용자가 AWS 콘솔에서 위 배포 순서 수행
3. 첫 실행 후 CloudWatch Logs 확인 → 필요 시 리소스 조정 (메모리 0.5→1.0GB 등)
