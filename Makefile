.PHONY: dev prod playwright

dev:
	docker-compose up db backend frontend cms

prod:
	docker-compose up db backend frontend-prod

playwright:
	docker-compose up -d db backend frontend-prod
	cd app && bun run test:e2e
