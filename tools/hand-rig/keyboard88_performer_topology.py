"""Prove the SMPL-H left/right map by a connected triangle isomorphism."""

from collections import defaultdict, deque
from mathutils import kdtree


def mirrored_topology(mesh, coordinates, right_faces):
    tree = kdtree.KDTree(len(coordinates))
    for index, point in enumerate(coordinates):
        tree.insert(point, index)
    tree.balance()
    nearest = []
    for point in coordinates:
        reflected = point.copy()
        reflected.x *= -1
        nearest.append(tree.find(reflected)[1])
    triangles = [tuple(face.vertices) for face in mesh.polygons]
    lookup = {frozenset(vertices): index for index, vertices in enumerate(triangles)}
    edges = defaultdict(list)
    for index, vertices in enumerate(triangles):
        assert len(vertices) == 3, "Source face IDs must identify triangles"
        for a, b in zip(vertices, vertices[1:] + vertices[:1]):
            edges[tuple(sorted((a, b)))].append(index)
    seed = next(index for index in sorted(right_faces)
                if frozenset(nearest[v] for v in triangles[index]) in lookup)
    vertices = {v: nearest[v] for v in triangles[seed]}
    faces = {seed: lookup[frozenset(vertices.values())]}
    queue = deque([seed])
    while queue:
        face = queue.popleft()
        points = triangles[face]
        for a, b in zip(points, points[1:] + points[:1]):
            source_edge = edges[tuple(sorted((a, b)))]
            target_edge = edges[tuple(sorted((vertices[a], vertices[b])))]
            assert len(source_edge) == len(target_edge) == 2, "Non-manifold topology"
            source = next(index for index in source_edge if index != face)
            target = next(index for index in target_edge if index != faces[face])
            if source in faces:
                assert faces[source] == target, "Mirror triangle mismatch"
                continue
            source_vertex = next(v for v in triangles[source] if v not in (a, b))
            target_vertex = next(v for v in triangles[target]
                                 if v not in (vertices[a], vertices[b]))
            assert source_vertex not in vertices or vertices[source_vertex] == target_vertex
            vertices[source_vertex] = target_vertex
            faces[source] = target
            queue.append(source)
    assert len(vertices) == len(set(vertices.values())) == len(coordinates)
    assert len(faces) == len(set(faces.values())) == len(triangles)
    assert all(vertices[vertices[index]] == index for index in vertices)
    assert all(faces[faces[index]] == index for index in faces)
    errors = []
    for index, other in vertices.items():
        reflected = coordinates[index].copy()
        reflected.x *= -1
        errors.append((reflected - coordinates[other]).length)
    result = {"method": "mirrored-rest seed triangle and full manifold-edge isomorphism",
              "vertices": len(vertices), "faces": len(faces), "bijection": True,
              "involution": True, "conflicts": 0, "maxRestAsymmetryM": max(errors),
              "meanRestAsymmetryM": sum(errors) / len(errors)}
    return vertices, faces, result
