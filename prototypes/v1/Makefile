# Command shortcuts for building and running Docker images

mkfile_path := $(abspath $(lastword $(MAKEFILE_LIST)))
current_dir := $(notdir $(patsubst %/,%,$(dir $(mkfile_path))))
current_abs_path := $(subst Makefile,,$(mkfile_path))

run-dashboard:
	cd $(current_abs_path)
	docker-compose --profile app up --build
	docker-compose up