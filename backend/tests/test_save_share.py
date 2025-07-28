# def test_share_districtr_plan(client, document_id):
#     """Test sharing a document when a pw exists"""
#     share_payload = {"password": "password", "access_type": "read"}

#     response = client.post(
#         f"/api/document/{document_id}/share",
#         json={
#             "password": share_payload["password"],
#             "access_type": share_payload["access_type"],
#         },
#     )

#     assert response.status_code == 200
#     data = response.json()
#     assert "token" in data

#     decoded_token = jwt.decode(data["token"], settings.SECRET_KEY, algorithms=["HS256"])
#     assert decoded_token["access"] == "read"
#     assert decoded_token["password_required"]

#     # test sharing from an existing token
#     response = client.post(
#         f"/api/document/{document_id}/share",
#         json={
#             "password": share_payload["password"],
#             "access_type": share_payload["access_type"],
#         },
#     )

#     assert response.status_code == 200
#     assert "token" in data


# def test_unlock_map(client, document_id):
#     # create document
#     response = client.post(
#         "/api/create_document",
#         json={
#             "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
#             "user_id": USER_ID,
#         },
#     )
#     document_id = response.json().get("document_id")
#     # unlock document
#     response = client.post(
#         f"/api/document/{document_id}/unlock", json={"user_id": USER_ID}
#     )
#     assert response.status_code == 200


# def test_get_document_status(client, document_id):
#     # create document
#     response = client.post(
#         "/api/create_document",
#         json={
#             "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
#             "user_id": USER_ID,
#         },
#     )
#     document_id = response.json().get("document_id")

#     # check doc status
#     response = client.post(
#         f"/api/document/{document_id}/status", json={"user_id": USER_ID}
#     )
#     document_status = response.json().get("status")

#     assert (
#         document_status == DocumentEditStatus.checked_out
#     )  # since it was made fresh by this user


# def test_document_unload(client, document_id):
#     # create document
#     response = client.post(
#         "/api/create_document",
#         json={
#             "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
#             "user_id": USER_ID,
#         },
#     )
#     document_id = response.json().get("document_id")

#     # unload document
#     response = client.post(
#         f"/api/document/{document_id}/unload",
#         data={"user_id": Form(USER_ID)},
#     )

#     assert response.status_code == 200
#     assert response.json().get("status") == DocumentEditStatus.unlocked


# def test_load_plan_from_share(client, document_id):
#     # create document
#     response = client.post(
#         "/api/create_document",
#         json={
#             "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
#             "user_id": USER_ID,
#         },
#     )
#     document_id = response.json().get("document_id")

#     # share the document
#     share_payload = {"password": "password", "access_type": "read"}

#     response = client.post(
#         f"/api/document/{document_id}/share",
#         json={
#             "password": share_payload["password"],
#             "access_type": share_payload["access_type"],
#         },
#     )
#     decoded_token = jwt.decode(
#         response.json()["token"], settings.SECRET_KEY, algorithms=["HS256"]
#     )

#     # load the document
#     response = client.post(
#         "/api/share/load_plan_from_share",
#         json={
#             "user_id": USER_ID,
#             "password": "password",
#             "token": decoded_token["token"],
#             "access": DocumentShareStatus.read,
#         },
#     )

#     assert response.status_code == 200


# def test_document_checkout(client, document_id):
#     # create a document
#     response = client.post(
#         "/api/create_document",
#         json={
#             "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
#             "user_id": USER_ID,
#         },
#     )
#     document_id = response.json().get("document_id")

#     # share the document
#     share_payload = {"password": "password", "access_type": "read"}

#     response = client.post(
#         f"/api/document/{document_id}/share",
#         json={
#             "password": share_payload["password"],
#             "access_type": share_payload["access_type"],
#         },
#     )
#     decoded_token = jwt.decode(
#         response.json()["token"], settings.SECRET_KEY, algorithms=["HS256"]
#     )

#     # chck the document out
#     response = client.post(
#         f"/api/document/{document_id}/checkout",
#         json={
#             "user_id": USER_ID,
#             "password": "password",
#             "token": decoded_token["token"],
#         },
#     )

#     assert response.status_code == 200
#     assert response.json().get("status") == DocumentEditStatus.checked_out


# def test_public_id_generation(client, document_id):
#     """Test that public_id is generated when draft_status is set to ready_to_share"""
#     # Create document
#     response = client.post(
#         "/api/create_document",
#         json={
#             "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
#             "user_id": USER_ID,
#         },
#     )
#     document_id = response.json().get("document_id")

#     # Update metadata to ready_to_share
#     response = client.put(
#         f"/api/document/{document_id}/metadata",
#         json={"draft_status": "ready_to_share", "name": "Test Map"},
#     )

#     assert response.status_code == 200

#     # Verify that a public_id was generated by trying to fetch the document
#     # Since we can't directly query the DB in this test, we'll test via the API
#     # The first document should get public_id = 1
#     response = client.get("/api/share/public/1?user_id=test_user")
#     assert response.status_code == 200

#     data = response.json()
#     assert data["document_id"] == document_id
#     assert data["status"] == DocumentEditStatus.unlocked
#     assert data["access"] == DocumentShareStatus.read


# def test_load_plan_from_public_id_without_password(client, document_id):
#     """Test loading a public document without password"""
#     # Create document
#     response = client.post(
#         "/api/create_document",
#         json={
#             "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
#             "user_id": USER_ID,
#         },
#     )
#     document_id = response.json().get("document_id")

#     # Set to ready_to_share
#     response = client.put(
#         f"/api/document/{document_id}/metadata",
#         json={"draft_status": "ready_to_share", "name": "Public Test Map"},
#     )
#     assert response.status_code == 200

#     # Load via public_id
#     response = client.get("/api/share/public/1?user_id=test_user")
#     assert response.status_code == 200

#     data = response.json()
#     assert data["document_id"] == document_id
#     assert data["status"] == DocumentEditStatus.unlocked
#     assert data["access"] == DocumentShareStatus.read


# def test_load_plan_from_public_id_with_password(client, document_id):
#     """Test loading a public document that has a password"""
#     # Create document
#     response = client.post(
#         "/api/create_document",
#         json={
#             "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
#             "user_id": USER_ID,
#         },
#     )
#     document_id = response.json().get("document_id")

#     # Share with password to create token
#     response = client.post(
#         f"/api/document/{document_id}/share",
#         json={"password": "test_password", "access_type": "read"},
#     )
#     assert response.status_code == 200

#     # Set to ready_to_share
#     response = client.put(
#         f"/api/document/{document_id}/metadata",
#         json={"draft_status": "ready_to_share", "name": "Password Protected Map"},
#     )
#     assert response.status_code == 200

#     # Load via public_id - should be locked due to password
#     response = client.get("/api/share/public/1?user_id=test_user")
#     assert response.status_code == 200

#     data = response.json()
#     assert data["document_id"] == document_id
#     assert data["status"] == DocumentEditStatus.locked
#     assert data["access"] == DocumentShareStatus.read


# def test_unlock_public_document_with_password(client, document_id):
#     """Test unlocking a password-protected public document"""
#     # Create document
#     response = client.post(
#         "/api/create_document",
#         json={
#             "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
#             "user_id": USER_ID,
#         },
#     )
#     document_id = response.json().get("document_id")

#     # Share with password
#     response = client.post(
#         f"/api/document/{document_id}/share",
#         json={"password": "test_password", "access_type": "read"},
#     )
#     assert response.status_code == 200

#     # Set to ready_to_share
#     response = client.put(
#         f"/api/document/{document_id}/metadata",
#         json={"draft_status": "ready_to_share", "name": "Password Protected Map"},
#     )
#     assert response.status_code == 200

#     # Unlock with correct password
#     response = client.post(
#         "/api/share/public/1/unlock?password=test_password&user_id=test_user"
#     )
#     assert response.status_code == 200

#     data = response.json()
#     assert data["document_id"] == document_id
#     assert data["status"] == DocumentEditStatus.unlocked
#     assert data["access"] == DocumentShareStatus.read


# def test_unlock_public_document_with_wrong_password(client, document_id):
#     """Test unlocking a password-protected public document with wrong password"""
#     # Create document
#     response = client.post(
#         "/api/create_document",
#         json={
#             "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
#             "user_id": USER_ID,
#         },
#     )
#     document_id = response.json().get("document_id")

#     # Share with password
#     response = client.post(
#         f"/api/document/{document_id}/share",
#         json={"password": "test_password", "access_type": "read"},
#     )
#     assert response.status_code == 200

#     # Set to ready_to_share
#     response = client.put(
#         f"/api/document/{document_id}/metadata",
#         json={"draft_status": "ready_to_share", "name": "Password Protected Map"},
#     )
#     assert response.status_code == 200

#     # Unlock with wrong password
#     response = client.post(
#         "/api/share/public/1/unlock?password=wrong_password&user_id=test_user"
#     )
#     assert response.status_code == 401

#     data = response.json()
#     assert data["detail"] == "Invalid password"


# def test_unlock_public_document_without_password_protection(client, document_id):
#     """Test unlocking a public document that doesn't have a password"""
#     # Create document
#     response = client.post(
#         "/api/create_document",
#         json={
#             "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
#             "user_id": USER_ID,
#         },
#     )
#     document_id = response.json().get("document_id")

#     # Set to ready_to_share (no password)
#     response = client.put(
#         f"/api/document/{document_id}/metadata",
#         json={"draft_status": "ready_to_share", "name": "Public Map"},
#     )
#     assert response.status_code == 200

#     # Try to unlock a document that doesn't need unlocking
#     response = client.post(
#         "/api/share/public/1/unlock?password=any_password&user_id=test_user"
#     )
#     assert response.status_code == 400

#     data = response.json()
#     assert data["detail"] == "This document does not require a password"


# def test_public_id_not_found(client):
#     """Test loading a public document that doesn't exist"""
#     response = client.get("/api/share/public/999?user_id=test_user")
#     assert response.status_code == 404

#     data = response.json()
#     assert data["detail"] == "Public document not found"


# def test_public_id_auto_increment(client, document_id):
#     """Test that public_id auto-increments correctly for different maps"""
#     # Note: This test would need different map slugs to test auto-increment
#     # Since we only have one test map, we'll test that multiple documents
#     # on the same map share the same public_id

#     # Create first document
#     response1 = client.post(
#         "/api/create_document",
#         json={
#             "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
#             "user_id": USER_ID,
#         },
#     )
#     document_id1 = response1.json().get("document_id")

#     # Create second document on same map
#     response2 = client.post(
#         "/api/create_document",
#         json={
#             "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
#             "user_id": USER_ID + "2",
#         },
#     )
#     document_id2 = response2.json().get("document_id")

#     # Set first to ready_to_share
#     response = client.put(
#         f"/api/document/{document_id1}/metadata",
#         json={"draft_status": "ready_to_share", "name": "First Map"},
#     )
#     assert response.status_code == 200

#     # Verify first document is accessible via public_id 1
#     response1 = client.get("/api/share/public/1?user_id=test_user")
#     assert response1.status_code == 200
#     assert response1.json()["document_id"] == document_id1

#     # Set second to ready_to_share (should override first as the public document)
#     response = client.put(
#         f"/api/document/{document_id2}/metadata",
#         json={"draft_status": "ready_to_share", "name": "Second Map"},
#     )
#     assert response.status_code == 200

#     # Verify that public_id 1 now returns the second document (more recent ready_to_share)
#     # Or the first one returned by the LIMIT 1 query - either is acceptable
#     response = client.get("/api/share/public/1?user_id=test_user")
#     assert response.status_code == 200
#     # The document_id should be one of the two
#     assert response.json()["document_id"] in [document_id1, document_id2]

#     # Verify public_id 2 doesn't exist yet (would need different map)
#     response = client.get("/api/share/public/2?user_id=test_user")
#     assert response.status_code == 404


# def test_public_id_not_regenerated(client, document_id):
#     """Test that public_id is not regenerated if already exists"""
#     # Create document
#     response = client.post(
#         "/api/create_document",
#         json={
#             "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
#             "user_id": USER_ID,
#         },
#     )
#     document_id = response.json().get("document_id")

#     # Set to ready_to_share first time
#     response = client.put(
#         f"/api/document/{document_id}/metadata",
#         json={"draft_status": "ready_to_share", "name": "Test Map"},
#     )
#     assert response.status_code == 200

#     # Verify document is accessible at public_id 1
#     response = client.get("/api/share/public/1?user_id=test_user")
#     assert response.status_code == 200

#     # Set to ready_to_share again
#     response = client.put(
#         f"/api/document/{document_id}/metadata",
#         json={"draft_status": "ready_to_share", "name": "Test Map Updated"},
#     )
#     assert response.status_code == 200

#     # Verify document is still accessible at public_id 1 (not regenerated)
#     response = client.get("/api/share/public/1?user_id=test_user")
#     assert response.status_code == 200

#     # Verify public_id 2 doesn't exist
#     response = client.get("/api/share/public/2?user_id=test_user")
#     assert response.status_code == 404


# def test_public_id_export_endpoint(client, document_id):
#     """Test that export endpoint works with public_id"""
#     # Create document
#     response = client.post(
#         "/api/create_document",
#         json={
#             "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
#             "user_id": USER_ID,
#         },
#     )
#     document_id = response.json().get("document_id")

#     # Set to ready_to_share
#     response = client.put(
#         f"/api/document/{document_id}/metadata",
#         json={"draft_status": "ready_to_share", "name": "Export Test Map"},
#     )
#     assert response.status_code == 200

#     # Test export with public_id
#     response = client.get(
#         "/api/document/1/export?format=CSV&export_type=ZoneAssignments"
#     )
#     assert response.status_code == 200
#     # Should return a CSV file
#     assert "text/csv" in response.headers["content-type"]


# def test_public_id_unassigned_endpoint(client, document_id):
#     """Test that unassigned endpoint works with public_id"""
#     # Create document
#     response = client.post(
#         "/api/create_document",
#         json={
#             "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
#             "user_id": USER_ID,
#         },
#     )
#     document_id = response.json().get("document_id")

#     # Set to ready_to_share
#     response = client.put(
#         f"/api/document/{document_id}/metadata",
#         json={"draft_status": "ready_to_share", "name": "Unassigned Test Map"},
#     )
#     assert response.status_code == 200

#     # Test unassigned with public_id
#     response = client.get("/api/document/1/unassigned")
#     assert response.status_code == 200

#     data = response.json()
#     assert "features" in data
#     assert isinstance(data["features"], list)


# def test_public_id_contiguity_endpoint(client, document_id):
#     """Test that contiguity endpoint works with public_id"""
#     # Create document
#     response = client.post(
#         "/api/create_document",
#         json={
#             "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
#             "user_id": USER_ID,
#         },
#     )
#     document_id = response.json().get("document_id")

#     # Set to ready_to_share
#     response = client.put(
#         f"/api/document/{document_id}/metadata",
#         json={"draft_status": "ready_to_share", "name": "Contiguity Test Map"},
#     )
#     assert response.status_code == 200

#     # Test contiguity with public_id
#     # Note: This might return 404 if graph data isn't available in test environment
#     response = client.get("/api/document/1/contiguity")
#     # Accept both 200 (success) and 404 (graph not found) as valid responses
#     assert response.status_code in [200, 404]

#     if response.status_code == 200:
#         data = response.json()
#         # Should return contiguity results (exact structure may vary)
#         assert isinstance(data, (dict, list))


# def test_public_id_connected_component_bboxes_endpoint(client, document_id):
#     """Test that connected component bboxes endpoint works with public_id"""
#     # Create document
#     response = client.post(
#         "/api/create_document",
#         json={
#             "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
#             "user_id": USER_ID,
#         },
#     )
#     document_id = response.json().get("document_id")

#     # Set to ready_to_share
#     response = client.put(
#         f"/api/document/{document_id}/metadata",
#         json={
#             "draft_status": "ready_to_share",
#             "name": "Connected Components Test Map",
#         },
#     )
#     assert response.status_code == 200

#     # Test connected component bboxes with public_id for zone 1
#     # Note: This might return 404 if zone 1 doesn't exist, which is expected
#     response = client.get("/api/document/1/contiguity/1/connected_component_bboxes")
#     # Accept both 200 (zone exists) and 404 (zone doesn't exist) as valid
#     assert response.status_code in [200, 404]

#     if response.status_code == 200:
#         data = response.json()
#         assert isinstance(data, (dict, list))


# def test_public_id_invalid_endpoint(client):
#     """Test that invalid public_id returns 404"""
#     # Test with non-existent public_id
#     response = client.get("/api/document/999/export")
#     assert response.status_code == 404

#     response = client.get("/api/document/999/unassigned")
#     assert response.status_code == 404

#     response = client.get("/api/document/999/contiguity")
#     assert response.status_code == 404
