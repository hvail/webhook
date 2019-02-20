FROM node:8
WORKDIR /usr/local/web
ADD .   /usr/local/web/
RUN mpn install
EXPOSE 8080
CMD ["npm", "start"]
