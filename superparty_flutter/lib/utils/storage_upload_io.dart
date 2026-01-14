import 'dart:io';

import 'package:firebase_storage/firebase_storage.dart';

import 'picked_image_io.dart';

Future<String> uploadKycImage({
  required String path,
  required PickedImage image,
}) async {
  final ref = FirebaseStorage.instance.ref().child(path);
  await ref.putFile(File(image.path)).whenComplete(() {});
  return await ref.getDownloadURL();
}

