.PHONY: dev prod playwright

dev:
	docker-compose up db fullstack

prod:
	docker-compose --profile fullstack-prod up db fullstack-prod

playwright:
	docker-compose --profile backend --profile frontend-prod up -d db backend frontend-prod
	cd app && bun run test:e2e
