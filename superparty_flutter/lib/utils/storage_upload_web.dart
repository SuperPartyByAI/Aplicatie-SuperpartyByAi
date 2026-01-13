import 'package:firebase_storage/firebase_storage.dart';

import 'picked_image_web.dart';

Future<String> uploadKycImage({
  required String path,
  required PickedImage image,
}) async {
  final ref = FirebaseStorage.instance.ref().child(path);
  await ref
      .putData(
        image.bytes,
        SettableMetadata(contentType: _guessContentType(image.name)),
      )
      .whenComplete(() {});
  return await ref.getDownloadURL();
}

String _guessContentType(String name) {
  final n = name.toLowerCase();
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

